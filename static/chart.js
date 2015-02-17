var updater_id = undefined;

var scatter_chart;
var host_chart;

var curr_ts_moment;
var curr_ts_sec;

var memento_dict;
var num_plot_mementos = 0;

var last_url = undefined;
var last_timestamp = undefined;
var last_mem_length = 0;


function cdx_json_to_host_agg(cdx_json) {
  var urls = {};
  
  for (var i = 0; i < cdx_json.length; i++) {
    var host = cdx_json[i].host;
    if (urls[host] != undefined) {
      urls[host]++;
    } else {
      urls[host] = 0;
    }
  }
  return {urls: urls};
}

function init_host_chart(memento_dict) {
  var names = {};
  var cols = [];
  var len = 0;

  for (host in memento_dict.urls) {
    if (typeof(memento_dict.urls[host]) === "number") {
      len = memento_dict.urls[host]
    } else {
      len = memento_dict.urls[host].length;
    }
    cols.push([host, len]);
    names[host] = host + " (" + len + ")";
  }

  //  console.log(JSON.stringify(cols));
  //  console.log(JSON.stringify(names));

  var data = {
    columns: cols,
    names: names,

    colors: {"MISSING": "#ff0000"},

    type: 'pie'
  };

  host_chart = undefined;

  if (!host_chart) {
    host_chart = c3.generate({
      bindto: '#hostchart',

      data: data,

      transition: {
        duration: 0
      },

      pie: {
        label: {
          show: false,
        },
        expand: false
      },
      legend: {
        position: 'right',
      },
    });
  } else {
    data.unload = true;
    host_chart.load(data);
    //host_chart.flush();
  }

  //chart.resize({width: 400});
}


function init_scatter(mem_data)
{
  memento_dict = mem_data;

  var data = {
    json: memento_dict.plot,
    xs: memento_dict.xs,
    type: 'scatter',
    xSort: false,
    color: function (color, d) {
      if (typeof(d) === "object") {
        if (d.x == 0) {
          color = d3.rgb(color).brighter(1).toString();
        }
      }
      return color;
    }
  };

  scatter_chart = undefined;
  
  // default: compute automatically
  var tick_count = undefined;
  
  if (num_plot_mementos < 6) {
    tick_count = num_plot_mementos;
  }

  if (!scatter_chart) {
    scatter_chart = c3.generate({
      bindto: "#scatterchart",
      data: data,

      transition: {
        duration: 0
      },

      point: {
        r: 5,
      },

      zoom: {
        enabled: true,
        extent: [1, 10000],
      },

      axis: {
        rotated: false,
        x: {
          //type: 'timeseries',
          show: true,
          tick: {
            //format: '%Y-%m-%d %H:%M:%S',
            // format: function (date) { return moment(date).from(curr_ts_moment); },
            format: function(x) { return x_to_date_offset(x); },
            fit: false,
            count: tick_count,
            multiline: true,
            width: 60,
            culling: {
              max: 6
            },
          },
          padding: {
            left: 0.5,
            right: 0.5,
          }
        },
        y: {
          show: false,
        },
      },

      grid: {
        x: {
          //show: true,
          lines: [
            {
              value: 0,
              //text: "Base Page",
            }
          ]
        }
      },

      tooltip: {
        grouped: true,
        format: {
          title: function (x) {
            if (x == 0) {
              return "Base Page";
            } else {
              return x_to_date_offset(x);
              //return moment(date).from(curr_ts_moment);
            }
          },

          value: function (value, ratio, id, index) {
            if (memento_dict && memento_dict.urls && 
                memento_dict.urls[id] && (index < memento_dict.urls[id].length)) {
              value = memento_dict.urls[id][index];
            }
            return value;
          }
        }
      },

      legend: {
        show: false,
      }

    });
  } else {
    data.unload = true;
    scatter_chart.load(data);
  }
}

function ts_to_date(ts)
{
  if (ts.length < 14) {
    return ts;
  }

  var datestr = (ts.substring(0, 4) + "-" +
                 ts.substring(4, 6) + "-" +
                 ts.substring(6, 8) + "T" +
                 ts.substring(8, 10) + ":" +
                 ts.substring(10, 12) + ":" +
                 ts.substring(12, 14) + "-00:00");

  var date = new Date(datestr);
  return date;
}

function init_moment_js()
{
  var rel = moment.localeData()._relativeTime;
  rel.future = "%s after";
  rel.past = "%s before";
  moment.locale('en', rel);
}

function update_capture_info(secs)
{
  if (!secs) {
    return;
  }

  var elem = document.getElementById("ts_info");
  if (elem) {
    //elem.innerHTML = ts_to_date(timestamp).toUTCString();
    elem.innerHTML = moment.utc(secs * 1000).format("YYYY-MMM-DD HH:mm:ss");
  }
}

function update_banner(info, include_frames)
{
  var url = info.url;
  var timestamp = info.timestamp;

  if (!url || !timestamp) {
    return;
  }

  if (last_url != url || last_timestamp != timestamp) {
    if (!info.seconds) {
      info.seconds = ts_to_date(info.timestamp).getTime() / 1000;
    }

    update_capture_info(info.seconds);

    function update_mem_link(name, backup_name)
    {
      var m_elem = document.getElementById("m_" + name);
      if (!m_elem) {
        return;
      }
      var val = info["m_" + name];

      if (!val && backup_name) {
        val = info["m_" + backup_name];
      }

      if (!val) {
        m_elem.classList.add("hidden");      
      } else {
        m_elem.classList.remove("hidden");
      }
      m_elem.setAttribute("href", wbinfo.prefix + val + "/" + info.url);
    }

    update_mem_link("first", "prev");
    update_mem_link("prev", "first");
    update_mem_link("next", "last");
    update_mem_link("last", "next");

    last_url = url;
    last_timestamp = timestamp;
    last_mem_length = 0;
  }

  load_all(include_frames);
}

function load_all(include_frames)
{
  // make list of all frames
  var frame_list = [];

  if (include_frames) {
    walk_frames(window.frames[0], frame_list);
  } else {
    frame_list.push(window.frames[0].location.href);
  }

  //console.log(JSON.stringify(frame_list));

  var counter = 0;

  var all_mems = undefined;

  var curr_frame_url = window.frames[0].location.href;

  for (var i = 0; i < frame_list.length; i++) {
    var url = frame_list[i].replace("/replay/", "/api/");
    d3.json(url, function(error, json) {
      counter++;

      if (!all_mems) {
        all_mems = json;
      } else {
        for (key in json) {
          all_mems[key] = json[key];
        }
      }

      if (counter >= frame_list.length) {
        // ensure still on same page
        if (window.frames[0].location.href == curr_frame_url) {
          update_charts(all_mems);
        }
      } 
    });
  }
}

function walk_frames(frame, frame_list)
{
  if (!frame.WB_wombat_location) {
    return;
  }

  if (frame.location.href === "about:blank") {
    return;
  }

  frame_list.push(frame.location.href);

  for (var i = 0; i < frame.frames.length; i++) {
    walk_frames(frame.frames[i], frame_list);
  }
}

function log_scale(diff)
{
  var scaler = 1;
  if (diff < 0) {
    diff = -diff;
    scaler = -1;
  }
  var result = Math.log(diff + 1);
  return scaler * result;
}

function x_to_date_offset(x)
{
  if (x == 0) {
    return "Base Page";
  }
  
  var scaler = 1;
  if (x < 0) {
    x = -x;
    scaler = -1;
  }
  
  var sec = Math.exp(x) - 1;
  sec = curr_ts_sec + (scaler * sec);
  
  return moment(sec * 1000).from(curr_ts_moment); 
}

function update_charts(json) {
  var mem_length = Object.keys(json).length;

  if (mem_length == last_mem_length) {
    return;
  }

  last_mem_length = mem_length;

  var mem_plot = {};
  var mem_xs = {};
  var mem_urls = {};
  
  num_plot_mementos = 0;

  curr_ts_sec = parseInt(json["_target_sec"]);
  curr_ts_moment = moment.unix(curr_ts_sec);
  
  var curr_min_sec = curr_ts_sec;
  var curr_max_sec = curr_ts_sec;

  var hasPoints = false;

  for (var key in json) {
    if (key.length > 0 && key[0] == "_") {
      continue;
    }

    var list = key.split(" ");

    var sec = parseInt(json[key]);
    //var curr_moment = moment.unix(sec);

    var host = list[0];
    var ts = list[1];
    var mem_url = list[2];

    if (!mem_urls[host]) {
      if (host != "MISSING") {
        mem_plot[host] = [];
        mem_plot[host + "_x"] = [];
        mem_xs[host] = host + "_x";
      }
      mem_urls[host] = [];
      hasPoints = true;
    }

    mem_urls[host].push(mem_url);

    if (host == "MISSING") {
      continue;
    }
    
    curr_max_sec = Math.max(sec, curr_max_sec);
    curr_min_sec = Math.min(sec, curr_min_sec);

    //var cdate = new Date(sec * 1000);
    var x = log_scale(sec - curr_ts_sec);
    var y = Math.random() * 4.0 - 2.0;

    if ((curr_ts_sec == sec) && (mem_url == last_url)) {
      y = 0.0;
      x = 0;
    }

    mem_plot[host + "_x"].push(x);
    mem_plot[host].push(y);
    num_plot_mementos++;
  }

  var mem_data = {
    plot: mem_plot,
    xs: mem_xs,
    urls: mem_urls
  };

  if (hasPoints) {
    init_scatter(mem_data);
    init_host_chart(mem_data);
  }
  
  var status;
  var meminfo_elem = document.getElementById("scatterinfo");
  
  if (num_plot_mementos <= 1) {
    status = "Showing a Single Memento";
  } else {
    var timespan = moment(curr_max_sec * 1000).from(moment(curr_min_sec * 1000));
    timespan = timespan.substring(0, timespan.lastIndexOf("after"));
    
    status = "Showing <b>{num}</b> Mementos spanning <b>{sec}</b>";
    status = status.replace("{num}", num_plot_mementos);
    status = status.replace("{sec}", timespan);
  }
  
  if (meminfo_elem) {
    meminfo_elem.innerHTML = status;
  }
}

if (window._wb_js) {
  _wb_js.create_banner_element = function(banner_id)
  {
    if (updater_id) {
      return;
    }

    if (document.readyState !== 'complete') {
      updater_id = window.setInterval(update_while_loading, 2000);
    }

    window.set_state = function(state) {
      curr_state = state;
      do_update(true);

      if (window.frames[0].document && 
          window.frames[0].document.readyState === 'complete') {
        stop_anim();
      }
    }
  }
}

function stop_anim()
{
  var elem = document.getElementById("icon");
  if (elem) {
    elem.classList.remove("rotate");
  }
}

function start_anim()
{
  var elem = document.getElementById("icon");
  if (elem) {
    elem.classList.add("rotate");
  }
  
  if (updater_id) {
    return;
  }

  updater_id = window.setInterval(update_while_loading, 2000);
}

function update_while_loading()
{
  if (document.readyState === 'complete') {
    window.clearInterval(updater_id);
    updater_id = undefined;
    stop_anim();
    // don't call do_update, that's called by eventlistener
  } else {
    do_update(false);
  }
}

function do_update(include_frames)
{
  var info;

  if (window.frames[0].wbinfo) {
    info = window.frames[0].wbinfo;
  } else {
    info = {}
    info.url = curr_state.url;
    info.timestamp = curr_state.timestamp;
  }

  update_banner(info, include_frames);
}

function toggle_banner()
{
  var banner = document.getElementById('mt_banner');
  banner.classList.toggle('closed');

  var toggle = document.getElementById('banner_toggle');

  if (banner.classList.contains('closed')) {
    toggle.innerHTML = "Time Travel!";
  } else {
    toggle.innerHTML = "&#10006;";
  }
}

function iframe_unloaded()
{
  start_anim();
}

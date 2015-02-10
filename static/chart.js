var updater_id = undefined;

var scatter_chart;
var host_chart;

var curr_ts_moment;
var curr_ts_sec;
var curr_ts_date;

var memento_dict;

var last_url = undefined;
var last_timestamp = undefined;
var last_mem_length = 0;


function init_host_chart(memento_dict) {
  var names = {};
  var cols = [];
  
  for (host in memento_dict.urls) {
    var len = memento_dict.urls[host].length;
    cols.push([host, len]);
    names[host] = host + " (" + len + ")";
  }
  
//  console.log(JSON.stringify(cols));
//  console.log(JSON.stringify(names));
  
  var data = {
    columns: cols,
    names: names,
    
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
        if (d.x == curr_ts_date) {
          color = d3.rgb(color).brighter(1).toString();
        }
      }
      return color;
    }
  };
  
  scatter_chart = undefined;

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
          type: 'timeseries',
          show: true,
          tick: {
            //format: '%Y-%m-%d %H:%M:%S',
            format: '%Y-%m-%d',
            fit: false,
            count: 3,
            //multiline: true,
            //width: 50,
            //culling: true,
            //multiline: true,
          },
        },
        y: {
          show: false,
//          padding: {
//            left: 10,
//            right: 10,
//          }
        }
      },
      
      tooltip: {
        grouped: true,
        format: {
          title: function (date) {
            if (date == curr_ts_date) {
              return "Base Page";
            } else {
              return moment(date).from(curr_ts_moment);
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
            

//      tooltip: {
//        contents: function (d, defaultTitleFormat, defaultValueFormat, color) {
//          if (typeof(d[0]) !== "object" || !memento_dict || !memento_dict.urls) {
//            return '';
//          }
//          
//          var urllist = memento_dict.urls[d[0].id];
//          if (!urllist) {
//            return '';
//          }
//          
//          var url = urllist[d[0].index];
//          var agostr = moment.unix(curr_ts_sec + d[0].x).from(curr_ts_moment);
//          
//          var format = "<div class='c3-tooltip'><table><tr>";
//          format += "<td>" + url + "</td>";
//          format += "<td><b>" + agostr + "</b></td>";
//          format += "</table></div>";
//          return format;
//        }
 //     },

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

function update_banner(info)
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

  var full_url = "/api/" + timestamp + "/" + url;

  d3.json(full_url, function(error, json) {
    if (error) {
      console.log(error);
      return;
    }
    
    if (json.length == last_mem_length) {
      return;
    }
    
    last_mem_length = json.length;
    
    var mem_plot = {};
    var mem_xs = {};
    var mem_urls = {};

    curr_ts_sec = parseInt(json["_target_sec"]);
    curr_ts_moment = moment.unix(curr_ts_sec);
    
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
      
      if (!mem_plot[host]) {
        mem_plot[host] = [];
        mem_xs[host] = host + "_x";
        mem_plot[host + "_x"] = [];
        mem_urls[host] = [];
        hasPoints = true;
      }
      var cdate = new Date(sec * 1000);
      var y = Math.random() * 4.0 - 2.0;

      if ((curr_ts_sec == sec) && (mem_url == url)) {
        y = 1.0;
        curr_ts_date = cdate;
      }
      
      mem_plot[host + "_x"].push(cdate);
      mem_plot[host].push(y);
      mem_urls[host].push(mem_url);
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
  });
}

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
    do_update();
    
    if (window.frames[0].document && 
        window.frames[0].document.readyState === 'complete') {
      stop_anim();
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
}

function update_while_loading()
{
  if (document.readyState === 'complete') {
    window.clearInterval(updater_id);
    stop_anim();
    // don't call do_update, that's called by eventlistener
  } else {
    do_update();
  }
}

function do_update()
{
  var info;

  if (window.frames[0].wbinfo) {
    info = window.frames[0].wbinfo;
  } else {
    info = {}
    info.url = curr_state.url;
    info.timestamp = curr_state.timestamp;
  }
  
  update_banner(info);
}

function toggle_banner()
{
  var banner = document.getElementById('mt_banner');
  banner.classList.toggle('closed');

  var toggle = document.getElementById('banner_toggle');

  if (banner.classList.contains('closed')) {
    toggle.innerHTML = "Time Travel!";
  } else {
    toggle.innerHTML = "X";
  }
}

function iframe_unloaded()
{
  start_anim();
}
var chart = undefined;
var last_unload = undefined;
var updater_id = undefined;

var scatter_chart;
var host_chart;

var memento_list;


function agg_by_host(data) {
  var res = d3.nest()
  .key(function(d) { return d.host})
  .sortKeys(d3.ascending)
  .rollup(function(d) { return d.length; })
  .entries(data);

  return res;
}

function init_host_chart(memento_list) {
  var agg = agg_by_host(memento_list);
  var cols = [];
  
  var names = {};

  for (var i = 0; i < agg.length; i++) {
    cols.push([agg[i].key, 
               agg[i].values]);
    
    names[agg[i].key] = agg[i].key + " (" + agg[i].values + ")";
  }
  
  console.log(names);
  
  var data = {
    columns: cols,
    names: names,
    type: 'pie'
  };

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
  }

  //chart.resize({width: 400});
}


function init_scatter(_mem_list)
{
  memento_list = _mem_list;

  var data = {
    json: _mem_list,
    // "curr": curr_memento},
    x: "x",
    keys: {
      value: ["y", "x"]
    },
    type: 'scatter',
    xSort: false,
    color: function(color, d) {
      if (typeof(d) !== "object" || d.index >= memento_list.length) {
        return color;
      }

      if (memento_list[d.index].curr_page) {
        return "#000";
      }

      return color;
    }
  };

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
          show: true,
          tick: {
            count: 2,
            //culling: true
          },
        },
        y: {
          show: false,
        }
      },

      tooltip: {
        contents: function (d, defaultTitleFormat, defaultValueFormat, color) {
          if (typeof(d[0]) !== "object" || d[0].index >= memento_list.length) {
            return '';
          }
          var mem = memento_list[d[0].index];     
          var format = "<div class='c3-tooltip'><table><tr>";
          format += "<td>" + mem.url + "</td>";
          format += "<td><b>" + mem.diststr + "</b></td>";
          format += "</table></div>";
          return format;
        }
      },

      legend: {
        show: false
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

  return new Date(datestr);
}

function init_moment_js()
{
  var rel = moment.localeData()._relativeTime;
  rel.future = "%s after";
  rel.past = "%s before";
  moment.locale('en', rel);
}

function update_capture_info(timestamp)
{
  var elem = document.getElementById("ts_info");
  if (elem) {
    //elem.innerHTML = ts_to_date(timestamp).toUTCString();
    elem.innerHTML = moment(ts_to_date(timestamp)).format("YYYY-MMM-DD HH:mm:ss");
  }
}

function update_banner(info)
{
  var url = info.url;
  var timestamp = info.timestamp;

  if (!url || !timestamp) {
    return;
  }

  update_capture_info(info.timestamp);

  function update_mem_link(name)
  {
    var val = info["m_" + name];
    if (!val) {
      return;
    }
    var m_elem = document.getElementById("m_" + name);
    if (!m_elem) {
      return;
    }
    m_elem.setAttribute("href", wbinfo.prefix + val + "/" + info.url);
  }

  update_mem_link("first");
  update_mem_link("prev");
  update_mem_link("next");
  update_mem_link("last");

  var full_url = "/api/" + timestamp + "/" + url;

  d3.json(full_url, function(error, json) {
    if (error) {
      console.log(error);
      return;
    }

    var mementos = [];

    var target_sec = parseInt(json["_target_sec"]);

    var target_moment = moment.unix(target_sec);

    for (var key in json) {
      if (key == "_target_sec") {
        continue;
      }

      var list = key.split(" ");

      var sec = parseInt(json[key]);

      var curr_moment = moment.unix(sec);

      var point = {"host": list[0],
                   "ts": list[1],
                   "url": list[2],

                   "x": sec - target_sec,
                   "y": Math.random() * 4.0 - 2.0,
                  };

      if ((sec - target_sec) == 0 && (point.url == url)) {
        point.curr_page = true;
        point.y = 1.0;
        point.diststr = "Current";
      } else {
        point.diststr = curr_moment.from(target_moment, false);
      }
      mementos.push(point);
    }

    if (mementos.length > 0) {
      init_scatter(mementos);
      init_host_chart(mementos);
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
  }
}

function update_while_loading()
{
  if (document.readyState === 'complete') {
    window.clearInterval(updater_id);
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
    toggle.innerHTML = "Show";
  } else {
    toggle.innerHTML = "X";
  }
}
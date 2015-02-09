var chart = undefined;
var last_unload = undefined;
var updater_id = undefined;


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
  var unload = [];

  for (var i = 0; i < agg.length; i++) {
    cols.push([//agg[i].key,
      agg[i].key + " (" + agg[i].values + ")",
      agg[i].values]);
  }

  var chart_json = {
    bindto: '#hostchart',

    data: {
      columns: cols,
      type : 'pie',
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
  };

  chart = c3.generate(chart_json);
  chart.resize({width: 400});
}


function init_scatter(memento_list)
{
  var chart = c3.generate({
    bindto: "#scatterchart",
    data: {
      json: memento_list,
      // "curr": curr_memento},
      x: "x",
      keys: {
        value: ["y", "x"]
      },
      type: 'scatter',
      xSort: false,
      color: function(color, d) {
        if (memento_list[d.index].curr_page) {
          return "#f00";
        }
        return color;
      }
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
      format: {
        //title: function (x) { console.log(x); return undefined; }
      },
      contents: function (d, defaultTitleFormat, defaultValueFormat, color) {
        var url = memento_list[d[0].index].url;
        var x_str = d[0].x;
        if (x_str > 0) {
          x_str = "+" + x_str;
        }
        var format = "<div class='c3-tooltip'><table><tr>";
        format += "<td>" + url + "</td>";
        format += "<td><b>" + x_str + " sec</b></td>";
        format += "</table></div>";
        return format;
      }
    },

    legend: {
      show: false
    }
  });
}

function update_capture_info(timestamp)
{
  var elem = document.getElementById("ts_info");
  if (elem) {
    elem.innerHTML =  _wb_js.ts_to_date(timestamp, true);
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

    for (var key in json) {
      if (key == "_target_sec") {
        continue;
      }

      var list = key.split(" ");
      var sec = parseInt(json[key]) - target_sec;


      var point = {"host": list[0],
                   "ts": list[1],
                   "url": list[2],

                   "x": sec,
                   "y": Math.random() * 4.0 - 2.0,
                   "size": 5.0};

      if (sec == 0 && point.url == url) {
        point["curr_page"] = true;
        point["y"] = 1.0;
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
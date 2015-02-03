function agg_by_host(data) {
  var res = d3.nest()
  .key(function(d) { return d.host})
  .sortKeys(d3.ascending)
  .rollup(function(d) { return d.length; })
  .entries(data);

  return res;
}

function init_host_chart(memento_list) {
    nv.addGraph(function() {
      var chart = nv.models.pieChart()
      //var chart = nv.models.discreteBarChart()
          .x(function(d) { return d.key + " (" + d.values + ")";})
          .y(function(d) { return d.values })
          .showLabels(false);

        d3.select("#hostchart svg")
            .datum(agg_by_host(memento_list))
            .transition().duration(350)
            .call(chart);

      nv.utils.windowResize(chart.update);

      return chart;
    });
}


function init_scatter(memento_list, curr_memento) {
    nv.addGraph(function() {
      var chart = nv.models.scatterChart()
                    .transitionDuration(350)
                    //.color(d3.scale.category10().range().slice(5));
                    .color(["#d62728", "#000000"]);

      //Configure how the tooltip looks.
      chart.tooltipContent(function(key, x, y, e) {
          var label = "<b>";
          if (x > 0) {
              label += "+";
          }
          label += x
          label += " sec: </b>";
          label += e.point["url"];
          return label;
      });

      //Axis settings
      //chart.xAxis.tickFormat(d3.format('.02f'));
      //chart.yAxis.tickFormat(d3.format('.02f'));

      //We want to show shapes other than circles.
      chart.scatter.onlyCircles(false);

      chart.showXAxis(true);
      chart.showYAxis(false);
      chart.showLegend(false);
      //chart.tooltipXContent(null);
      chart.tooltipYContent(null);
      chart.useVoronoi(false);

      var scatter_data = [{"key": "mementos", "values": memento_list},
                          {"key": "curr", "values": curr_memento}];

      //console.log(scatter_data);

      d3.select('#scatter svg')
          .datum(scatter_data)
          .call(chart);

      nv.utils.windowResize(chart.update);

      return chart;
    });
}


function load_embed_viz(url, timestamp)
{
    var full_url = "/api/" + timestamp + "/" + url;

    d3.json(full_url, function(error, json) {
        if (error) {
            console.log(error);
            return;
        }

        var mementos = [];
        var curr_only = [];

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
                         "shape": "diamond",
                         "size": 5.0};

            if (sec == 0 && point.url == url) {
                point["shape"] = "circle";
                point["size"] = 10;
                point["y"] = 0;
                curr_only = [point];
            } else {
                mementos.push(point);
            }
        }

        if (curr_only.length > 0 || mementos.length > 0) {
            init_scatter(mementos, curr_only);

            //combine for host chart
            if (curr_only.length > 0) {
                mementos.push(curr_only[0]);
            }
            init_host_chart(mementos)
        }
    });
}



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


function init_scatter(memento_list) {

}

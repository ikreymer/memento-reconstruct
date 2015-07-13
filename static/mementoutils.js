jQuery.fn.stickToBottom = function () {
    var docHeight = $(window).height();
    var footerHeight = $(".footer").height();
    var footerTop = $(".footer").position().top + footerHeight;
    if (footerTop < docHeight) {
        $(".footer").css("margin-top", (docHeight - footerTop) + 'px');
    }
    return this;
}

jQuery.fn.floatRight = function () {
    //this.css("position", "absolute");
    this.css("position", "relative");
    this.css("left", Math.max(0, (($(window).width() - $(this).outerWidth())) + 
        $(window).scrollLeft()) + "px");
    return this;
}

jQuery.fn.center = function (height, footer) {
    if (height == null) {
        height = false;
    }
    if (footer == null) {
        footer = false;
    }
    this.css("position", "absolute");
    if (height) {
        footerHeight = 0;
        if (footer) {
            footerHeight = $(".footer").height();           
        }
        this.css("top", Math.max(0, (($(window).height() - $(this).outerHeight()) / 2) -
                                                    footerHeight + 
                                                    $(window).scrollTop()) + "px");
    }
    this.css("left", Math.max(0, (($(window).width() - $(this).outerWidth()) / 2) + 
        $(window).scrollLeft()) + "px");
    return this;
}

function calculateMinHeightForResults() {
    var docHeight = $(window).outerHeight();
    var footerHeight = $("#list_footer").outerHeight();
    var headerHeight = $("#header").outerHeight();
    var menuHeight = $("#list_menu_top").outerHeight();
    return docHeight - (footerHeight*2 + headerHeight + menuHeight);
}

var startYear = 1996
var curDate = new Date();
//var monthNames = [ "January", "February", "March", "April", "May", "June",
//"July", "August", "September", "October", "November", "December" ];


/**
  * Converts a date string into a date object. 
  * Expects date string to be of the format 20140512012010
  * and handles errors and substring only in this format.
  * But it can handle any valid date string as well.
  */
function convertToDate(d) {
    date_str = ""
    d_index = 0
    delimter = {4: "-", 6: "-", 8: " ", 10: ":", 12: ":", 14: " GMT"};
    filler = {4: "01", 6: "01", 8: "00", 10: "00", 12: "00"};

    // if date is a valid string
    if (isNaN(+d)) {
        date = new Date(d);
        if (!isNaN(date.valueOf())) {
            return date;
        }
        else {
            return null;
        }
    }
    if (d.length < 4 || d.length % 2 != 0 || d.length > 14) {
        return null;
    }
    
    // checking if year is within the range of typical archive holdings
    year = d.substring(0, 4);
    if (+year < startYear || +year > new Date().getUTCFullYear()) {
        return null;
    }

    d_index += 4;
    date_str = year + delimter[d_index];
    while (d_index < 14) {
        d_ss = d.substring(d_index, d_index+2);
        date_str += (d_ss == "") ? filler[d_index] : d_ss;
        d_index += 2;
        date_str += delimter[d_index];
    }
    date = new Date(date_str);
    if (!isNaN(date.valueOf())) {
        return date;
    }
    return null;
}

function pad(val) {
    return (val.toString().length == 1) ? "0" + val.toString() : val;
}

function getDisplayDate(d, timeline) {    
    // default display time is yyyy-mm-dd
    if (timeline) {
        //return monthNames[d.getUTCMonth()] +
        //    " " + d.getUTCFullYear();
        return pad(d.getUTCMonth()+1) + "-" + d.getUTCFullYear().toString();
    }
    else {
        //return pad(d.getUTCDate()) + " " + monthNames[d.getUTCMonth()] +
        //    " " + d.getUTCFullYear().toString();
        return d.getUTCFullYear().toString() + "-" + pad(d.getUTCMonth()+1) + "-" +
            pad(d.getUTCDate());
    }
}

function getDisplayTime(d) {
    return pad(d.getUTCHours()) + ":" +
        pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
}

function getMachineDate(d) {
    if (!d || isNaN(d.valueOf())) {
        return;
    }
    return d.getUTCFullYear().toString() + pad(d.getUTCMonth()+1) + pad(d.getUTCDate()) +
        pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds());
}

function createTimeline(mementoDistribution, container_id) {

    /*
    var mementoDistribution = [{"date":"1990-03-14","total":3},
        {"date":"1995-03-14","total":8},
        {"date":"2000-03-14","total":2},
        {"date":"2005-03-14","total":10},
        {"date":"2007-03-14","total":3},
        {"date":"2010-01-14","total":10},
        {"date":"2010-02-14","total":2},
        {"date":"2010-03-14","total":20},
    {"date":"2012-03-14","total":12}];
    */

    if (!mementoDistribution) {
        mementoDistribution = [];
    }

    var baseData = []
    var maxInData = d3.max(mementoDistribution, function(d) { return +d.total; });

    if (!maxInData) {
        maxInData = 10;
    }

    for (y=startYear; y<=curDate.getUTCFullYear(); y++) {
        for (m=1; m<=12; m++) {
            baseData.push({"date": y + "-" + m + "-14", "total": maxInData});
        }
    }

    var margin = {top: 5, right: 5, bottom: 20, left:40};
    var width = $("#"+container_id).width();
    var height = $("#"+container_id).height();

    startDate = new Date(startYear + "-1-1")
    var x = d3.time.scale()
    .domain([startDate, new Date(baseData[baseData.length - 1].date)])
    .rangeRound([0, width - margin.left - margin.right]);

    var y = d3.scale.linear()
    .domain([0, maxInData])
    .range([height - margin.top - margin.bottom, 0])

    var xAxis = d3.svg.axis()
    .scale(x)
    .orient('bottom')
    .ticks(d3.time.year, 1)
    //.tickFormat(d3.time.format('%a %d'))
    .tickSize(-height, -height)
    .tickPadding(8);

    tickArr = x.ticks()
    tickDistance = x(tickArr[1]) - x(tickArr[0])

    var yAxis = d3.svg.axis()
    .scale(y)
    .orient('left')
    .ticks(2)

    var svg = d3.select('#'+container_id).append('svg')
    .attr('class', 'chart')
    .attr('width', width)
    .attr('height', height)
    .append('g')
    .attr('transform', 'translate(' + margin.left + ', ' + margin.top + ')');
    //.attr('transform', 'translate(' + margin.left + ', ' + 0 + ')');

    // actual chart
    svg.selectAll('.chart')
    .data(mementoDistribution)
    .enter().append('rect')
    .attr('class', 'bar')
    .attr('x', function(d) {  return x(new Date(d.date)); })
    .attr('y', function(d) { return height - margin.top - margin.bottom - (height - margin.top - margin.bottom - y(d.total)) })
    .attr('width', (tickDistance/12)-2)
    .attr('height', function(d) { return height - margin.top - margin.bottom - y(d.total) })
    .style('fill', '#525252')

    // base graph
    svg.selectAll('.chart')
    .data(baseData)
    .enter().append('rect')
    .attr('class', 'bar')
    .attr('x', function(d) { return x(new Date(d.date)); })
    .attr('y', function(d) { return height - margin.top - margin.bottom - (height - margin.top - margin.bottom - y(d.total)) })
    .attr('width', (tickDistance/12)-2)
    .attr('height', function(d) { return height - margin.top - margin.bottom - y(d.total) })
    .on("mouseover", function(d) { showChartPopup(this, d); })
    .on("mouseout", function() { hideChartPopup(this); })
    //.on("click", function(d) { launchTimeTravel(this, d); })
    .style('opacity', '0');

    svg.append('g')
    .attr('class', 'x axis')
    .attr('transform', 'translate(0, ' + (height - margin.top - margin.bottom) + ')')
    .call(xAxis)
    .selectAll("text")
    .attr("y", 6)
    .attr("x", tickDistance/4); // the width of the tick / number of chars in the year

    svg.append('g')
    .attr('class', 'y axis')
    .call(yAxis)
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -35)
    .attr("dy", ".71em")
    .style("text-anchor", "end")
    //.text("# mementos")

    /*
    var mem_x1 = x(new Date(acceptDatetime));
    var mem_y1 = 10 - height - margin.top - margin.bottom - (height - margin.top - margin.bottom - y(19));
    var mem_x2 = x(new Date(acceptDatetime));
    var mem_y2 = 80 + height - margin.top - margin.bottom - (height - margin.top - margin.bottom - y(19));

    // adding memento line
    svg.selectAll(".mementoline")
    .data([mementoDatetime])
    .enter().append("line")
    .attr("class", "mementoline")
    .attr("x1", mem_x1)
    .attr("y1", mem_y1)
    .attr("x2", mem_x2)
    .attr("y2", mem_y2)
    .style("stroke", "red")
    .style("stroke-width", "1px")

    // left arrow
    svg.append('path')
    .attr('d', d3.svg.symbol().type('triangle-up'))
    .attr('transform', "translate(0" + (mem_x2-10) +"," + (mem_y2-7) +") rotate(-90)")
    .style("fill", "red");

    // right arrow
    svg.append('path')
    .attr('d', d3.svg.symbol().type('triangle-up'))
    .attr('transform', "translate(0" + (mem_x2+10) +"," + (mem_y2-7) +") rotate(90)")
    .style("fill", "red");
    */
}

function showChartPopup(obj, d) {
    var selectedDate = new Date(d.date);
    var displayDate = getDisplayDate(selectedDate, timeline=true);
    var coord = d3.mouse(obj);
    $(obj).css('fill', 'red');
    $(obj).css('opacity', '0.7');
    $(obj).css('cursor', 'pointer');
    $(obj).css('cursor', 'hand');
    var infobox = d3.select(".chart_infobox");
    // now we just position the infobox roughly where our mouse is
    infobox.style("left", (coord[0] + 60) + "px" );
    infobox.style("top", (coord[1] - 130) + "px");
    $(".chart_infobox").html(displayDate);
    $(".chart_infobox").show();
}

function hideChartPopup(obj) {
    $(obj).css('opacity', '0');
    $(".chart_infobox").hide();
}

function launchTimeTravel(obj, d) {
    var selectedDate = new Date(d.date);
    var machineDate = getMachineDate(selectedDate);
    reloadPage(machineDate, "replay");
}

function reloadPage(machineDate, service) {
    if (!machineDate) {
        machineDate = getMachineDate(new Date());
    }
    var reqUrl = $("#url").val();

    if (reqUrl == "" || reqUrl == "http://" || reqUrl == "https://") {
        $("#url").val("");
        $("#url").attr("placeholder", "enter a web address");
        return;
    }
    //var origin = window.location.origin;
    //var path = window.location.pathname;
    //var service = path.split("/")[1];

    var loc = "";
    if (service == "list") {
        loc = "http://timetravel.mementoweb.org/list/";
    }
    else if (service == "reconstruct") {
        loc = "http://timetravel.mementoweb.org/reconstruct/";
    }

    loc = loc + machineDate + "/" + reqUrl;
    console.log(loc)
    window.location.href = loc;
}

function enableSearchOnEnterKey() {

    // submit page on enter press
    $( "input" ).keypress( function (e) {
        if (e.which == 13) {
            var date = $("#datepicker").val();
            date += "T" + $("#timepicker").val() + "Z";
            var d = convertToDate(date);
            reloadPage(getMachineDate(d), "replay");

            return false;
        }
    });
}

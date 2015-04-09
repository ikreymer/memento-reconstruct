//var mementoDatetime = "2010-03-14"
var acceptDatetime = wbinfo.timestamp;
var requestUrl = wbinfo.capture_url;

function multiverse_frame_loaded(event) {
    var frame = document.getElementsByClassName("wb_iframe")[0];
    var iframe_div = document.getElementById("iframe_div");
    var frameHeight = frame.contentWindow.document.body.offsetHeight;
    var body = document.body,
            html = document.documentElement;

    var bodyHeight = Math.max( body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight );
    bodyHeight = bodyHeight - 360;
    if (frameHeight > bodyHeight) {
        iframe_div.style.height = (360 + frameHeight) + 'px';
    }
    else {
        iframe_div.style.height = bodyHeight + "px";
    }
    iframe_loaded(event);
}

function init_iframe_height() {

    var frame = document.getElementsByClassName("wb_iframe")[0];
    var iframe_div = document.getElementById("iframe_div");
    var frameHeight = frame.contentWindow.document.body.offsetHeight;
    var body = document.body,
            html = document.documentElement;

    var bodyHeight = Math.max( body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight );
    bodyHeight = bodyHeight - 360;
    iframe_div.style.height = bodyHeight + "px";
}


$(function() {

    init_iframe_height();

    $("#list_menu_top").load("/menu_top.html");
    $("#list_footer").load("/menu_bottom.html", function() {
        //$("#menu_bottom").center();
    });
    $( window ).resize( function() {
        //$("#menu_bottom").center();
        $("#result_wrapper").css("min-height", calculateMinHeightForResults()+16 + "px");
    });
    var adt = null;
    if (acceptDatetime) {
        adt = convertToDate(acceptDatetime);
    }
    if (!adt || isNaN(adt.valueOf())) {
        adt = new Date();
    }
    $("#datepicker").val(getDisplayDate(adt));
    $("#timepicker").val(getDisplayTime(adt));

    $("#url").val(requestUrl);

    $("#search").button()
    .click( function() {
        var date = $("#datepicker").val();
        date += "T" + $("#timepicker").val() + "Z";
        var d = convertToDate(date);
        reloadPage(getMachineDate(d), "list");
    });

    $("#reconstruct").button()
    .click( function() {
        var date = $("#datepicker").val();
        date += "T" + $("#timepicker").val() + "Z";
        var d = convertToDate(date);
        reloadPage(getMachineDate(d), "replay");
    });
    $("#summary").center();
    
    $("#prev_memento").button({
        label: "&#9668"
    });
    $("#next_memento").button({
        label: "&#9658"
    });
    // #TODO: Fix accept datetime to memento dt
    var memDate = convertToDate(acceptDatetime);
    $("#this_memento").text( getDisplayDate(memDate) + " " + getDisplayTime(memDate) + " GMT");

    if ($("#prev_memento").attr("title") == "Previous: ") {
        $("#prev_memento").button("option", "disabled", true);
    }
    if ($("#next_memento").attr("title") == "Next: ") {
        $("#next_memento").button("option", "disabled", true);
    }
    //enableSearchOnEnterKey();
    $("#result_wrapper").css("min-height", calculateMinHeightForResults() + "px");

    /*
    $(".more_mementos_icon").addClass("ui-icon ui-icon-minus");
    $(".more_mementos").next().hide();
    $(".more_mementos_icon").switchClass("ui-icon-minus", "ui-icon-plus");
    $(".more_mementos").first().next().show();
    $($(".more_mementos").first().children()[0]).switchClass("ui-icon-plus", "ui-icon-minus");
    $(".more_mementos").click( function() {
        var sub_results = $(this).next();
        var isOpen = sub_results.is(":visible");
        sub_results[isOpen ? 'slideUp' : 'slideDown']()
        .trigger(isOpen ? 'hide' : 'show');

        if (isOpen) {
            $($(this).children()[0]).switchClass("ui-icon-minus", "ui-icon-plus");
        }
        else {
            $($(this).children()[0]).switchClass("ui-icon-plus", "ui-icon-minus");
        }

    });
    */

});

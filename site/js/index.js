$(document).ready(function() {

    var frame = document.getElementById("viewer-frame");

    function loadNewPage () {
        var page = window.location.hash.replace("#", '');
        if(page !== '') {
            frame.src = "site/pages/" + page + ".html";
        }
    }
    loadNewPage();

    window.addEventListener("hashchange", loadNewPage, false);

    $( ".logo" ).click(function() {
        frame.src = "site/pages/home.html"
        window.location.hash = ""
    });

    $( ".tutorials-button" ).click(function() {
        frame.src = "site/pages/tutorials.html"
        window.location.hash = "tutorials"
    });

    $( ".demos-button" ).click(function() {
        frame.src = "site/pages/demos.html"
        window.location.hash = "demos"
    });

    $( ".reference-button" ).click(function() {
        frame.src = "site/pages/reference.html"
        window.location.hash = "reference"
    });

    $( ".about-button" ).click(function() {
        frame.src = "site/pages/about.html"
        window.location.hash = "about"
    });

    $( ".community-button" ).click(function() {
        frame.src = "site/pages/community.html"
        window.location.hash = "community"
    });

    $( ".logotop-bar-item" ).click(function() {
        frame.src = "site/pages/home.html"
        window.location.hash = ""
    });

});

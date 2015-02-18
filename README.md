*2rss
======

Turn public Facebook & Twitter timelines into RSS


Prerequisites
-------------
* [PhantomJS](http://phantomjs.org/)

Usage
-----
Invocation:

    phantomjs [phantomjs option]... SCRIPT URL OUTPUTFILE

Examples:

    $ phantomjs --ssl-protocol=any fb2rss/tw2rss.js https://twitter.com/ndurner ndurner.rss

    $ phantomjs --ssl-protocol=any fb2rss/fb2rss.js https://de-de.facebook.com/diezeit diezeit.rss

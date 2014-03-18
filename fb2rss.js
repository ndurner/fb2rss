var fs = require("fs");
var system = require('system');
var phantom = window.phantom;

function errorHandler(msg, trace)
{
    var msgStack = ['PHANTOM ERROR: ' + msg];
    if (trace && trace.length) {
        msgStack.push('TRACE:');
        trace.forEach(function(t) {
            msgStack.push(' -> ' + (t.file || t.sourceURL) + ': ' + t.line + (t.function ? ' (in function ' + t.function + ')' : ''));
        });
    }
    console.error(msgStack.join('\n'));
    phantom.exit(1);
};

function hash(s)
{
  var h = new Uint8Array(16);
  
  for (var i = 0; i < s.length; i++) {
    var carry;
    for (var j = h.length - 1; j >= 0; j--) {
      var ch = h[j];
      var newCarry = ch >> 5;
      ch = (ch << 3) | carry;
      carry = newCarry;
      h[j] = ch ^ h[j];
    }
    
    h[h.length - 1] ^= s.charCodeAt(i);
  }
  
  var str = "";
  var a = "a".charCodeAt(0);
  for (var i = 0; i < h.length; i++) {
    var n = h[i];
    str = str + String.fromCharCode(a + (n & 0xF)) +
      String.fromCharCode(a + (n >> 4));
  }
  
  return str;
}

function writeRSSHeader(dst, page, doc, dt)
{
  var desc = doc.querySelector("[class='fbLongBlurb']").innerText;
  
  dst.write(
    "<?xml version=\"1.0\" encoding=\"UTF-8\" ?>" +
    "<rss version=\"2.0\">" +
    "<channel>" +
    " <title>" + page.title + "</title>" +
    " <description>" + desc + "</description>" +
    " <link>" + page.url + "</link>" +
    " <lastBuildDate>" + dt.toUTCString() + "</lastBuildDate>" +
    " <pubDate>" + dt.toUTCString() + "</pubDate>\n"
  );
}

function writeRSSFooter(dst)
{
  dst.write(
    " </channel>" +
    "</rss>"
  );
}

function writeItem(dst, link, dt, title, content)
{
  var dstr;
  
  if (dt)
    dstr = " <pubDate>" + dt.toUTCString() + "</pubDate>";
  else {
    dstr = "";
    console.log("no date: " + title);
  }
  
  dst.write(
    " <item>" +
    " <title><![CDATA[" + title + "]]></title>" +
    " <description><![CDATA[" + content + "]]></description>" +
    " <link><![CDATA[" + link + "]]></link>" +
    " <guid isPermaLink=\"false\"><![CDATA[" + link + "#" + hash(dt + title + content) + "]]></guid>" +
    dstr +
    " </item>\n"
  );
}

function saveRSS(url, destFN)
{
  var webpage = require("webpage");
  var page = webpage.create();
  
  page.onError = errorHandler;
  
  console.log("opening " + url);
  page.open(url, function() {
    console.log("page opened");
    
    document.body.innerHTML = page.content;
    var fb = document.body;

    console.log("operating on page: " + fb.querySelector("[itemprop = 'name']").innerText);

    var dst = fs.open(destFN, "w");
    var name = fb.querySelector("[itemprop = 'name']").innerText;
    var articles = fb.querySelectorAll("[role='article']");
    var lastEntry;
    
    if (articles) {
      var date = fb.querySelector("abbr[data-utime]");
      if (date) {
        lastEntry = new Date(1000 * date.getAttribute("data-utime"));
      }
    }
    
    writeRSSHeader(dst, page, fb, lastEntry);
    
    console.log("articles: " + articles.length);
    
    for (var articleIdx = 0; articleIdx < articles.length; articleIdx++) {
      var article = articles[articleIdx];
      var title = undefined;
      var content = undefined;
      var dt = undefined;
      
      var isActivity = article.querySelector("[class ~= 'timelineRecentActivityStory']");
      var dto = article.querySelector("abbr[data-utime]");
      var articleUrl = url;

      title = name;

      if (dto)
        dt = new Date(1000 * dto.getAttribute("data-utime"));
      
      if (isActivity) {
        var activity = article.querySelector("div[class ~= 'timelineRecentActivityStory']");
        var div = activity.querySelector("div[class = 'fsl fcg']");
        
        title += ": " + div.innerText;
        content = div.innerHTML;
        articleUrl = div.querySelector("a").getAttribute("href");
        if (articleUrl.substring(0, 32) === "http://www.facebook.com/l.php?u=")
          articleUrl = decodeURIComponent(url.substring(32, articleUrl.length));
        else if (articleUrl.substring(0, 1) == "/")
          articleUrl = "http://facebook.com" + articleUrl;
      }
      else {
        var userContent = article.querySelector("[class = 'userContent']");
        var pic = article.querySelector("[class ~= 'photo']");

        if (userContent) {
          content = userContent.innerHTML;
          
          if (pic) {
            var innerPic = pic.querySelector("img[class ~= 'scaledImageFitWidth']");
            if (!innerPic)
              innerPic = pic;
            content += "<div>" + innerPic.outerHTML + "</div>";
          }        

          title += ": " + userContent.innerText;
        }
        else {
          content = article.innerHTML;
          title += ": " + article.innerText;
        }
      }
      
      writeItem(dst, articleUrl, dt, title, content);
    }
    
    writeRSSFooter(dst);

    dst.close();
    phantom.exit(0);  
  });
}

{
  var args = system.args;
  
  if (args.length === 1) {
    console.log('Usage: phantomjs fb2rss.js url destination.rss');
    phantom.exit(1);
  }
  
  var url = args[1];
  var dest = args[2];
  
  phantom.onError = errorHandler;
  
  saveRSS(url, dest);
}

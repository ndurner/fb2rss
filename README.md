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

Notes
-----
 * Running this frequently (e.g. every hour) will entail an IP ban
 * PhantomJS 2.x memory usage is excessive (> 4 GB), PhantomJS 1.9 works modestly
 * Running on AWS
    * EC2 t2.nano seems sufficient (for PhantomJS 1.9)
    * EC2 instance starts can be scheduled cheaply through AWS Lambda
      
      Node.js script:
<pre>
    var aws = require('aws-sdk');
    var https = require('https');
    var url = require('url');
&nbsp;
exports.handler = function(event, context) {
        var ec2 = new aws.EC2({ region: '<span style="font-size: 12px">&#x270D;</span> instance region here <span style="font-size: 12px">&#x270D;</span>' });
        
        var params = {
            InstanceIds: [
                '<span style="font-size: 12px">&#x270D;</span> instance-id-here <span style="font-size: 12px">&#x270D;</span>',
            ],
            AdditionalInfo: '',
            DryRun: false
        };
        
        ec2.startInstances(params, function(err, data) {
            if (err)
                console.log(err, err.stack);
            else
                console.log(data);
        });    
    }
</pre>    
      IAM role:
<pre>
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "ec2:StartInstances",
                "ec2:StopInstances"
            ],
            "Resource": "*"
        }
    ]
}
</pre>


[![NPM Downloads][npmdt-image]][npmdt-url]
[![NPM Version][npmv-image]][npmv-url]
[![GitHub Tag][ghtag-image]][ghtag-url]
[![GitHub License][ghlic-image]][ghlic-url]
[![Dependencies Status][david-image]][david-url]

bagarino
========
_Bagarino_ (means _"scalper"_ in Italian) generates and validates alphanumeric tickets using a number of different expiration policies.
_Bagarino_ can tell a real ticket from a fake one. Simple, fast and RESTful.
Ask it for a new ticket and it'll give you. Then ask it whether a ticket is still valid or expired. Or whether it is a fake. It'll know for sure.
When tickets expire simply ask bagarino for new ones.

_Bagarino_ can be used as a support for a licensing server and as an helper to other systems in an authentication/authorization scenario.


## Table of Contents
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [Tickets](#tickets)
  - [New Tickets](#new-tickets)
  - [Valid Tickets](#valid-tickets)
  - [Expired Tickets](#expired-tickets)
  - [Forcible Manual Expiration](#forcible-manual-expiration)
  - [Mass-creation of Tickets](#mass-creation-of-tickets)
  - [Tickets Contexts](#tickets-contexts)
  - [Auto-renewing Tickets](#auto-renewing-tickets)
  - [Tickets Generation Speed](#tickets-generation-speed)
  - [Lightweight Validation](#lightweight-validation)
  - [Retrieve Tickets Policy](#retrieve-tickets-policy)
  - [Payloads](#payloads)
  - [Status Check](#status-check)
- [Statistics](#statistics)
- [Garbage Collection](#garbage-collection)
- [License](#license)


## Install
	npm install -g bagarino

## Usage
_Bagarino_ needs Redis ([redis.io](http://redis.io/)) to be installed and running in order to work.
To run bagarino use the following command:

	sudo bagarino

_Bagarino_ is now up and running, listening for requests on port 8124.

## Configuration
Right out of the box _bagarino_ is configured to run with default settings that make it listen on port 8124, protocol _http_, and log to _/var/log_.
These settings can be easily overridden by placing a file named _"bagarino.conf"_ under _/etc_.
This file must contain a valid JSON, organized as follows:
```js
{
    "ENVIRONMENT": "production",

    "PORT": 8124,
    "HTTPS_PORT": 8443,

    "SERVER_TYPE": {
        "HTTPS": {
            "ENABLED": false,
            "KEY":  "private/key.pem",
            "CERT": "private/cert.crt"
        },
        "HTTP": {
            "ENABLED": true
        }
    },

    "LOGGING": {
        "ENABLED": true,
        "PATH": "/var/log"
    },

    "REDIS": {
        "HOST": "localhost",
        "PORT": 6379,
        "DB": 3
    },

    "SECONDS_TO_REMEMBER_TICKETS_UNTIL": 864000,

    "CORS":
    {
        "ENABLED": false,
        "ORIGINS": []
    }
}
```

This file can be generated by calling `sudo bagarino initconf`.

The **"ENVIRONMENT"** key is passed to Nodejs and tells it whether to start in _production_ or _development_ mode.
The two keys **"PORT"** and **"HTTPS_PORT"** set on which port the server will be listening for incoming requests.
The **"SERVER_TYPE"** key enables one of the two modes _bagarino_ can be started in, either simple HTTP or HTTPS.
The **"HTTPS"** sub-key has some more configuration in it as the paths to the key and certificate files must be provided.
The **"LOGGING"** key establishes under which folder the logs will be placed.
The **"REDIS"** key tells _bagarino_ where is the Redis instance that will be used to save tickets.
Finally, the **"CORS"** key can be used to enable [_CORS_](https://www.w3.org/TR/cors/) requests on the _bagarino_ service.
When **"ENABLED"** is true the **"ORIGINS"** sub-key must be populated with one or more hosts, like this:
```"ORIGINS": ["http://google.com", "http://twitter.com", "https://abc.xyz"]```
When _CORS_ is enabled but no origin is specified it will be assumed the "*" value, meaning _"all origins"_.


## Tickets
Here's a detailed guide on how to submit requests for creating new tickets and/or validating old ones.

### New tickets
Obtain a new ticket:

    GET http://localhost:8124/tickets/new?policy=requests_based
    200 OK {"result":"OK","ticket":"7fd88ab09e40f99767e17df27a723d05562d573b","expires_in":100,"policy":"requests_based"}

See the status of the newly created ticket:

    GET http://localhost:8124/tickets/7fd88ab09e40f99767e17df27a723d05562d573b/status
    200 OK {"status":"VALID","expires_in":99,"policy":"requests_based"}

After some requests (99 more in this case) the ticket expires. Then, asking for it again will result in the following response:

    200 OK {"status": "EXPIRED"}

Asking for a non-existent ticket results in the following:

    GET http://localhost:8124/tickets/321somenonsense123/status
    404 Not Found {"status":"ERROR","cause":"not_found"}

By default new tickets have a time-based expire policy and a time-to-live of 60 seconds.
A different policy can be used by specifying the _"policy"_ parameter in query-string:
 * **policy=time_based** is the default one. Add "seconds=300" to make the ticket expire after the non-default delay of 5 minutes.
 * **policy=requests_based** makes the ticket expire after a certain amount of requests of its status you do to bagarino. By default it's 100 requests, but you can otherwise specify e.g. "requests=500" to make it last for 500 requests.
 * **policy=cascading** makes the ticket _depend_ on another one: once the _dependency_ ticket expires the _dependent_ one does as well.
 * **policy=manual_expiration** makes the ticket perpetual, unless you make it expire manually by calling the _"expire"_ verb (explained some lines below).
 * **policy=bandwidth_based** makes the ticket perpetual as well, but the number of requests for it that can be done within a minute is limited.

Let's see some requests that create tickets with different expiration policies:

    GET http://localhost:8124/tickets/new?policy=requests_based&requests=5
    200 OK {"result":"OK","ticket":"62a315cd7bdae5e84567cad9620f82b5defd3ef0","expires_in":5,"policy":"requests_based"}

    GET http://localhost:8124/tickets/new?policy=requests_based
    200 OK {"result":"OK","ticket":"0b4e20ce63f7de9a4a77910e7f909e5dba4538f3","expires_in":100,"policy":"requests_based"}

    GET http://localhost:8124/tickets/new?policy=time_based&seconds=120
    200 OK {"result":"OK","ticket":"50ab14d6f5dd082e8ed343f7adb5f916fa76188a","expires_in":120,"policy":"time_based"}

    GET http://localhost:8124/tickets/new?policy=cascading&depends_on=f073145dfdf45a6e85d0f758f78fd627fa301983
    200 OK {"result":"OK","ticket":"9ae23360fb4e9b3348917eb5e9b8a8e725b0dcb0","depends_on":"f073145dfdf45a6e85d0f758f78fd627fa301983","policy":"cascading"}

    GET http://localhost:8124/tickets/new?policy=manual_expiration
    200 OK {"result":"OK","ticket":"f57d75c23f6a49951a6e886bbc60de74bc02ef33","policy":"manual_expiration"}

When using the manual expiration policy you must call an appropriate verb to make the ticket expire:

    GET http://localhost:8124/tickets/f57d75c23f6a49951a6e886bbc60de74bc02ef33/expire
    200 OK {"status":"EXPIRED"}

Subsequent requests for that ticket will give an "EXPIRED" status.

Finally, bandwidth-based tickets can be created with the following requests:

	GET http://localhost:8124/tickets/new?policy=bandwidth_based&reqs_per_minute=100
    200 OK {"result": "OK", "ticket": "2966c1fc73a0d78c96bdc18fb67ed99af1356b8a", "requests_per_minute": 100, "policy": "bandwidth_based"}


### Valid tickets
Asking for a ticket status is all you can do with a newly created ticket. _bagarino_ will answer with three different statuses:
 * **VALID**
 * **EXPIRED**
 * **NOT_VALID**

The answer will carry some more info when the ticket is still valid:

    GET http://localhost:8124/tickets/0b4e20ce63f7de9a4a77910e7f909e5dba4538f3/status
    200 OK {"status":"VALID","expires_in":99,"policy":"requests_based"}

In the previous example the expiration policy and the TTL (Time-To-Live) of the ticket are returned, as well as its status.
The parameter *"expires_in"* has to be read based on the policy of the ticket:
 * When the policy is **time_based** then *"expires_in"* is the number of seconds before the ticket expires
 * When the policy is **requests_based** the value of *"expires_in"* is the number of requests before the ticket expires


### Expired tickets
Expired tickets are kept in memory by _bagarino_ for 10 days. After that time a call to their status will return "NOT_VALID" as it would for a ticket that didn't exist in the first place.


### Forcible Manual Expiration
Even tickets with a policy other than *"manual_expiration"* can be forcibly ended by calling the *expire* verb, provided that they had been created with an ad-hoc option, *"can\_force\_expiration"*:

	GET http://localhost:8124/tickets/new?policy=requests_based&can_force_expiration=true
    200 OK {"result": "OK", "ticket": "d81d9b01e323510ba919c0f54fbfba5b7903e326", "expires_in": 100, "policy": "requests_based"}

The result will look identical to any other *requests_based*-policied ticket but the *can\_force\_expiration* option enables the call to the *expire* verb to successfully end this ticket life:

	GET http://localhost:8124/tickets/d81d9b01e323510ba919c0f54fbfba5b7903e326/expire
    200 OK {"status": "EXPIRED"}

Creating the ticket without this option and subsequently calling *expire* would have produced the following error:

	400 Bad Request {"status": "ERROR", "cause": "different_policy"}


### Mass-creation of Tickets
It's possible to create more tickets at once by adding the paramenter "count" to the query-string of the verb _new_, followed by the number of tickets to be created.
The maximum number of tickets that can be created this way is capped to prevent overloading the system.
Here's a typical request for mass-creation of tickets:

    GET http://localhost:8124/tickets/new?count=4
    200 OK {"result":"OK","tickets":["9c7800ec9cf053e60674042533710c556fe22949","3cd5da62c2ba6d2b6b8973016264282f61f4afdd","7207c7effb2bd8fd97b885a4f72492a97e79babf","75a6cf2ba0454dfe74a4d6ce8baa80881fb76005"],"expire_in":60,"policy":"time_based"}


### Tickets Contexts
Sometimes it may be useful to bound one or more tickets to a "context" so they only acquire a meaning under certain conditions.
In _bagarino_ this is done by attaching a textual context to the ticket during the "new" operation:

    GET http://localhost:8124/tickets/new?policy=requests_based&context=mysweetlittlecontext
    200 OK {"result":"OK","ticket":"7486f1dcf4fc4d3c4ef257230060aea531d42758","expires_in":100,"policy":"requests_based"}

Once it's scoped this way requests for that ticket status that don't specify the context won't be able to retrieve it, resulting in a "not_found" error, the same given when asking for a non-existent ticket:

    GET http://localhost:8124/tickets/7486f1dcf4fc4d3c4ef257230060aea531d42758/status
    404 Not Found {"status":"ERROR","cause":"not_found"}

The way to ask for a context-bound token is as follows:

    GET http://localhost:8124/tickets/7486f1dcf4fc4d3c4ef257230060aea531d42758/status?context=mysweetlittlecontext
    200 OK {"status":"VALID","expires_in":99,"policy":"requests_based"}


### Auto-renewing Tickets
A ticket created with the option _autorenew=true_ automatically generates a new one right before expiring.
Only requests-based ones can be decorated at creation with the additional option _"autorenew"_.
When this option is `true` _bagarino_ automatically spawns a new ticket when the old one's expiration is one request away,
returning this newly created one alongside the validity/expiration info of a _"status"_ request.
The new ticket's policy and initial TTL will be the same as the old one's.

Here's how an autorenew ticket is created:

	GET http://localhost:8124/tickets/new?policy=requests_based&requests=10&autorenew=true
	200 OK {"result":"OK","expires_in":10,"ticket":"0cca33a81e4ce168f218d74692e096c676af2a25","policy":"requests_based"}

After asking 9 times for this ticket validity here's what happens asking one more time:

	GET http://localhost:8124/tickets/0cca33a81e4ce168f218d74692e096c676af2a25/status
	200 OK {"status":"VALID","expires_in":0,"policy":"requests_based","next_ticket":"c7433c48f56bd224de43b232657165842609690b"}

A new ticket, _c7433c48f56bd224de43b232657165842609690b_, is born, right when the old one expires and with the same policy and initial TTL (i.e. 10 requests).


### Tickets Generation Speed
Generating a ticket takes some CPU time and, under certain circumstances, this may be an issue. To arbitrarily reduce generation time a feature is present in _bagarino_ that can be activated by passing certain values to the optional _**"generation_speed"**_ parameter.

	GET http://localhost:8124/tickets/new?policy=time_based&seconds=30&generation_speed=slow
	200 OK
	{"result":"OK","expires_in":30,"ticket":"e7e0dc24544cf038daf1e5f32ff0451a65a04661","policy":"time_based"}

	GET http://localhost:8124/tickets/new?policy=time_based&seconds=30&generation_speed=fast
	200 OK
	{"result":"OK","expires_in":30,"ticket":"BgvPnLoxr","policy":"time_based"}

	GET http://localhost:8124/tickets/new?policy=time_based&seconds=30&generation_speed=faster
	200 OK
	{"result":"OK","expires_in":30,"ticket":"1437313717902","policy":"time_based"

Notice how the format of the tickets is different for every approach: that's a direct consequence of the speed the tickets are generated.
**When no generation speed is specified the default _slow_ one is used.**
It's almost superfluous to note that faster generation speeds are more subject to _weak_ tickets
that can conflict across an eventual _multi-bagarino-s_ environment.
Viceversa, slower generation speeds are more CPU-demanding although giving birth to _strong_ tickets that are almost unique.


### Lightweight Validation
Sometimes checking a ticket validity directly influences its status: in particular requests- or bandwidth-based tickets
have policies that put a direct correlation between the number of times a "status" check is called for them and their validity itself.

There may be times when it's needed to check whether a ticket with one of these policies is valid or not,
without affecting its status.
At those times a "status" call can be expanded with a "light" parameter, like this:

	GET http://localhost:8124/tickets/7ed46ccc3606ca87ce71071e4abd894abd53b972/status?light=true
	200 OK {"status":"VALID","expires_in":100,"policy":"requests_based"}

The net result, in this case for a requests-based ticket, is the call not affecting the remaining number of times the "status" call can be made for this ticket.
I.e. Calling status on it again will show the same number of remaining "status" checks:

	GET http://localhost:8124/tickets/7ed46ccc3606ca87ce71071e4abd894abd53b972/status?light=true
	200 OK {"status":"VALID","expires_in":100,"policy":"requests_based"}

Almost the same applies to bandwidth-based tickets, except that, for them, the number of "status" checks resets every minute.


### Retrieve Tickets Policy
In _bagarino_ version 1.10.2 a new utility call has been added, that can be used to retrieve which policy a ticket responds to:

	GET http://localhost:8124/tickets/7ed46ccc3606ca87ce71071e4abd894abd53b972/policy
	200 OK {"policy":"**requests_based**","more":{"autorenew":false,"generation_speed":"slow","can_force_expiration":false}}

This way the policy for that ticket can be retrieved without the need to issue a "status" call on it.
You can notice that the response to a "policy" call carries some additional info about other parameters driving the ticket behavior.
In fact, the "more" object contains a list of settings for this ticket other than the policy type.
For explanations about any of them see the paragraphs above in this same guide.


### Payloads
In _bagarino_ version 2.4.0 a new feature has been added: **creating tickets with a JSON payload**.
POST-ing a request for a new ticket, with some data and to the route `/tickets/new/withpayload`
will trigger the creation of a _traditional_ ticket which will be saved alongside those data.
Data are saved and accessible until the ticket expires; once expired they will be deleted and won't be accessible anymore.
Some limitations apply, mostly to avoid abusing of this feature:
- No mass-creation allowed; only one ticket carrying a payload will be created each time the route is called.
- The payload can be max 1MB in size

Here's how such tickets can be created:
``` Bash
$ curl -H "Content-Type: application/json" -X POST -d '{"payloadField":"This is a payload"}' http://localhost:8124/tickets/new/withpayload?policy=manual_expiration
{"result":"OK","ticket":"cfeb196b51e47f1234e4a02e52edaf45a3acde99","policy":"manual_expiration"}
```

And this is the call that retrieves the payload of a ticket still valid:

    GET http://localhost:8124/tickets/cfeb196b51e47f1234e4a02e52edaf45a3acde99/payload
    200 OK "{\"payloadField\": \"This is a payload\"}"

Tickets carrying a payload behave exactly as dictated by their expiration policies,
only their payload can be treated in particular ways depending on some of these policies:
- Auto-renewing tickets aren't allowed to carry a payload
- Payload requests to bandwidth-based tickets **affect** the bandwidth count
- Payload requests to requests-based tickets **decrease** the number of remaining requests


### Status Check
An endpoint is available to check the status of the _bagarino_ service.
The `/status` endpoint returns a simple JSON document containing some useful information about the server, like memory, node version and other.
It returns `200 OK` if everything is fine:

    GET http://localhost:8124/status
    200 OK {"status":"OK","memory":{"rss":"~40MB","heapTotal":"~22MB","heapUsed":"~14MB"},"uptime":12.144,"node-version":"v6.3.1"}

**NOTE: Do not abuse this endpoint because it's not throttled**


## Statistics
By running `bagarino stats` we can collect some statistics about the current population of tickets:
```Bash
$ bagarino stats
{
    "tickets": {
        "total": 282,
        "ignored": 0,
        "orphans": 3,
        "policies": {
            "requests_based": 178,
            "time_based": 0,
            "manual_expiration": 50,
            "bandwidth_based": 54,
            "cascading": 0
        },
        "exploration": "valid-based"
    },
    "duration": "0.033s"
}
```
Orphan (or _"stale"_) tickets are the ones that got somehow forgotten by bagarino. They tipically are very old and can be safely deleted by performing a garbage collection (see [Garbage Collection](#garbage-collection)).
Some tickets may be ignored during the collection, mainly because they have been modified by hand in the Redis instance.
The _"exploration"_ field may be safely ignored; it's only used for debug purposes at the moment.
The _"duration"_ field is the total time used by bagarino to collect the stats.

**NOTE: It may take quite some time to collect the statistics altough we won't degrade Redis performances by doing it**
NOTE: The tickets being analyzed are the ones stored inside the Redis instance currently configured (see [Configuration](#configuration))


## Garbage Collection
Under some circumstances it may happen that one or more old tickets become _stale_ and continue to be tracked by bagarino even if they aren't active anymore.
A command-line switch can be used to remove them all at once, but pay attention to some potential issues:
- stale tickets can't be recovered after they got deleted by a garbage collection
- a big number of stale tickets (> 100K) may cause the garbage collection to degrade bagarino performances until the cleanup ends

Here's the command-line that activates the garbage collection:
```Bash
bagarino gc
```

Or:
```Bash
bagarino gcv
```

The latter is much (very much!) verbose, reporting progress for every stale ticket being deleted, so be careful when using it.

Here's an example response from `bagarino gc`:
```Bash
Starting garbage collection...
Got 12 key(s) to analyze...
Garbage Collection performed correctly.
1 stale ticket(s) cleaned.
```

**Please note that garbage-collection of tickets with payloads destroys such payloads as well.**

## License

Copyright (c) 2016 Nicola Orritos
Licensed under the Apache-2 license.



[npmdt-image]: https://img.shields.io/npm/dt/bagarino.svg  "NPM Downloads"
[npmdt-url]: https://www.npmjs.com/package/bagarino
[npmv-image]: https://img.shields.io/npm/v/bagarino.svg  "NPM Version"
[npmv-url]: https://www.npmjs.com/package/bagarino
[ghtag-image]: https://img.shields.io/github/tag/NicolaOrritos/bagarino.svg  "GitHub Tag"
[ghtag-url]: https://github.com/NicolaOrritos/bagarino/releases
[ghlic-image]: https://img.shields.io/github/license/NicolaOrritos/bagarino.svg  "GitHub License"
[ghlic-url]: https://github.com/NicolaOrritos/bagarino/blob/master/LICENSE
[david-image]: https://img.shields.io/david/NicolaOrritos/bagarino.svg  "David-dm.org Dependencies Check"
[david-url]: https://david-dm.org/NicolaOrritos/bagarino

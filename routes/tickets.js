
var hash = require('node_hash');
var redis = require("redis");

var client = redis.createClient();

client.on("error", function (err)
{
    console.log("Got an error from the Redis client: " + err);
});

var REDIS_DB = 3;

var VALID_TICKET = "VALID";
var NOT_VALID_TICKET = "NOT_VALID";
var EXPIRED_TICKET = "EXPIRED";
var EXPIRED_PREFIX = "EXPIRED:";

var DEFAULT_EXPIRES_IN = 60;  // Sixty seconds
var REMEMBER_UNTIL = 60 * 60 * 24 * 10;  // Ten days


function createNewTicket()
{
    var now = new Date().getTime().toString();
        
    console.log("Generating ticket from current date and time (since epoch): %s", now);
    
    now += Math.random();
    
    console.log("After adding random salt: %s", now);
    
    var ticket = hash.sha1(now);
    
    return ticket;
}


exports.new = function(req, res)
{
    client.select(REDIS_DB, function()
    {
        var ticket = createNewTicket();
        
        // First save the "real" ticket:
        client.set(ticket, VALID_TICKET);
        client.expire(ticket, DEFAULT_EXPIRES_IN);
        
        // Then save the "to-be-expired" counterpart:
        client.set(EXPIRED_PREFIX + ticket, EXPIRED_TICKET);
        client.expire(EXPIRED_PREFIX + ticket, REMEMBER_UNTIL);
        
        
        var reply = {"result": "OK", "ticket": ticket, "expires_in": DEFAULT_EXPIRES_IN};
        
        res.send(reply);
    });
};

exports.status = function(req, res)
{
    client.select(REDIS_DB, function()
    {
        var ticket = req.param("ticket");
        
        if (ticket)
        {
            client.exists(ticket, function(error, exists)
            {
                console.log("[tickets.status] exists returned: %s", exists);
                console.log("[tickets.status] error was: %s", error);
                
                if (exists)
                {
                    client.ttl(ticket, function(error, ttl)
                    {
                        var reply = {"status": VALID_TICKET, "expires_in": ttl};
                        
                        res.send(reply);
                    });
                }
                else
                {
                    // Check whether it expired:
                    client.exists(EXPIRED_PREFIX + ticket, function(error, expired)
                    {
                        console.log("[tickets.status] expired returned: %s", expired);
                        console.log("[tickets.status] error was: %s", error);
                        
                        if (expired)
                        {
                            var reply = {"status": EXPIRED_TICKET};
                            
                            res.send(reply);
                        }
                        else
                        {
                            var reply = {"status": NOT_VALID_TICKET};
                            
                            res.send(reply);
                        }
                    });
                }
            });
        }
        else
        {
            var reply = {"status": "ERROR", "cause": "empty_request"};
            
            res.send(reply);
        }
        
    });
};



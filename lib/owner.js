
module.exports = owner

owner.usage = "npm owner add <username> <pkg>"
            + "\nnpm owner rm <username> <pkg>"
            + "\nnpm owner ls <pkg>"

owner.completion = function(args, index, cb) {
  var remotePkgs = require("./utils/completion/remote-packages")
    , getCompletions = require("./utils/completion/get-completions")
    , subcmdList = ["add", "ls", "rm"]
    , subcmd = args[0] || ""
    , users = require("./utils/completion/users")

  if (subcmdList.indexOf(subcmd) !== -1) {
    if (subcmd === "ls") {
      remotePkgs(args.slice(1), index - 1, false, false, false, cb)
    } else if (subcmd === "add" || subcmd === "rm") {
      if (index === 4) {
        remotePkgs(args.slice(2), index - 2, false, false, false, cb)
      } else {
        users(args.slice(1), index - 1, cb)
      }
    }
  } else cb(null, getCompletions(subcmd, subcmdList))
}

var registry = require("./utils/registry")
  , get = registry.request.GET
  , put = registry.request.PUT
  , log = require("./utils/log")
  , output = require("./utils/output")
  , npm = require("../npm")

function owner (args, cb) {
  var action = args.shift()
  switch (action) {
    case "ls": case "list": return ls(args[0], cb)
    case "add": return add(args[0], args[1], cb)
    case "rm": case "remove": return rm(args[0], args[1], cb)
    default: return unknown(action, cb)
  }
}

function ls (pkg, cb) {
  if (!pkg) return cb(owner.usage)
  get(pkg, function (er, data) {
    var msg = ""
    if (er) return log.er(cb, "Couldn't get owner data for "+pkg)(er)
    var owners = data.maintainers
    if (!owners || !owners.length) msg = "admin party!"
    else msg = owners.map(function (o) { return o.name +" <"+o.email+">" }).join("\n")
    output.write(npm.config.get("outfd"), msg, function (er) {
      cb(er, owners)
    })
  })
}

function add (user, pkg, cb) {
  log.verbose(user+" to "+pkg, "owner add")
  mutate(pkg, user, function (u, owners) {
    if (!owners) owners = []
    for (var i = 0, l = owners.length; i < l; i ++) {
      var o = owners[i]
      if (o.name === u.name || o.email === u.email) {
        log( "Already a package owner: "+o.name+" <"+o.email+">"
           , "owner add"
           )
        return false
      }
    }
    owners.push(u)
    return owners
  }, cb)
}
function rm (user, pkg, cb) {
  log.verbose(user+" from "+pkg, "owner rm")
  mutate(pkg, user, function (u, owners) {
    var found = false
      , m = owners.filter(function (o) {
          var match = (o.name === u.name || o.email === u.email)
          found = found || match
          return !match
        })
    if (!found) {
      log("Not a package owner: "+u.name+" <"+u.email+">", "owner rm")
      return false
    }
    if (!m.length) return new Error(
      "Cannot remove all owners of a package.  Add someone else first.")
    return m
  }, cb)
}
function mutate (pkg, user, mutation, cb) {
  get("/-/user/org.couchdb.user:"+user, function (er, u) {
    if (er) return log.er(cb, "Error getting user data for "+user)(er)
    if (!u || u.error) return cb(new Error(
      "Couldn't get user data for "+user+": "+JSON.stringify(u)))
    get("/"+pkg, function (er, data) {
      if (er) return log.er(cb, "Couldn't get package data for "+pkg)(er)
      var m = mutation({ "name" : u.name, "email" : u.email }, data.maintainers)
      if (!m) return cb() // handled
      if (m instanceof Error) return cb(m) // error
      data = { _id : data._id
             , _rev : data._rev
             , maintainers : m
             }
      put("/"+pkg+"/-rev/"+data._rev, data, function (er, data) {
        if (er) return log.er(cb, "Failed to update package metadata")(er)
        if (data.error) return cb(new Error(
          "Failed to update pacakge metadata: "+JSON.stringify(data)))
        cb(null, data)
      })
    })
  })
}

function unknown (action, cb) {
  cb("Usage: \n"+owner.usage)
}

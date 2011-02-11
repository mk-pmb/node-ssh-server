var Binary = require('binary');
var Put = require('put');
var constants = require('./constants');

exports.unpack = function (buf) {
    var algos = constants.algorithms.slice();
    
    var keyx = Binary.parse(buf)
        .word8('kexinit')
        .buffer('cookie', 16)
        .loop(function (end) {
            var algo = algos.shift();
            if (!algo) end()
            else {
                this
                    .word32be(algo.key + '.size')
                    .buffer(algo.key + '.buffer', algo.key + '.size')
                    .tap(function (vars) {
                        vars[algo.key].algorithms = 
                            vars[algo.key].buffer.toString().split(',');
                    })
                ;
            }
        })
        .word8('first_kex_packet_follows')
        .word32be('reserved')
        .vars
    ;
    
    return keyx.kexinit === constants.magic.kexinit
        ? keyx : undefined
    ;
};

exports.pack = function (selected) {
    return Put()
        .word8(constants.magic.kexinit)
        .put(new Buffer(16)) // cookie
        .put(selected.reduce(function (put, algo) {
            var buf = new Buffer(algo);
            return put.word32be(buf.length).put(buf);
        }, Put()).buffer())
        .word8(0) // first_kex_packet_follows (don't guess)
        .word32be(0) // reserved
    ;
};

exports.select = function (req, algo) {
     return first(req[algo].algorithms, function (name) {
        var cname = name.replace(/-/g,'').replace(/^hmac/,'');
        return first(constants.algorithms, function (x) {
            for (var i = 0; i < x.names.length; i++) {
                var n = x.names[i];
                if (n.replace(/-/g,'') === cname) {
                    return { serverName : n, clientName : name };
                }
            }
        });
    });
};

function first (xs, cb) {
    for (var i = 0; i < xs.length; i++) {
        var res = cb(xs[i], i);
        if (res !== undefined) return res;
    }
    return undefined;
}

exports.response = function (req) {
    var algos = constants.algorithms;
    var choices = [];
    var res = { choices : {} };
    for (var i = 0; i < algos.length; i++) {
        var algo = algos[i].key;
        var choice = exports.select(req, algo);
        choices.push(choice);
        res.choices[algo] = choice;
    }
    res.buffer = exports.pack(
        choices.map(function (c) { return c ? c.clientName : 'none' })
    ).buffer();
    return res;
};
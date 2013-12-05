
exports.module = module

var bufw = require('./bufw')
var rs = require('./rs')

exports.bin = require('./bin')

exports.makeWriter = function(blockSize, ws){
	return new bufw.W(blockSize, ws)
}

exports.makeReader = function(){
	return rs.make()
}

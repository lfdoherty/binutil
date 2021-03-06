"use strict";

var TextDecoder = require('./decoder')

function readBoolean(buffer, offset){

	var result = buffer[offset] === 1;
	return result;
}

function readInt(buffer, offset){

	var result = 0;

	result += buffer[0+offset] << 24;
	result += buffer[1+offset] << 16;
	result += buffer[2+offset] << 8;
	result += buffer[3+offset] << 0;

	return result;
}

function readLong(buffer, offset){

	var first = readInt(buffer, offset);
	var second = readInt(buffer, offset+4);

	var result = first + (second*2147483648);
	
	return result;
}

function writeBoolean(buffer, offset, value){
	buffer[offset] = value ? 1 : 0;
}

function writeInt(buffer, offset, value){

	buffer[0+offset] = (value >> 24)&255;
	buffer[1+offset] = (value >> 16)&255;
	buffer[2+offset] = (value >> 8)&255;
	buffer[3+offset] = (value >> 0)&255;
}	

function readUnsignedIntCompactly(buffer, offset){
	
	var b0 = buffer[0+offset];
	if(!(b0 & 128)) return [1,b0];
	var b1 = buffer[1+offset];
	if(!(b1 & 128)){
		return [2,(b0 & 127) + (b1 << 7)];
	}
	var b2 = buffer[2+offset];
	if(!(b2 & 128)){
		return [3,(b0 & 127) + ((b1 & 127) << 7) + (b2 << 14)];
	}
	var b3 = buffer[3+offset];
	if(!(b3 & 128)){
		return [4, (b0 & 127) + ((b1 & 127) << 7) + ((b2 & 127) << 14) + (b3 << 21)];
	}
	var b4 = buffer[4+offset];
	return [5, (b0 & 127) + ((b1 & 127) << 7) + ((b2 & 127) << 14) + ((b3 & 127) << 21) + (b4 << 28)];
}

function writeUnsignedIntCompactly(buffer, offset, value){
	if(value < 0) throw 'not unsigned';
	if(value < 128){
		buffer[0+offset] = value;
		return 1;
	}else if(value < 16384){
		buffer[0+offset] = value | 128; // 128 = 010000000 in binary - i.e. we set the high bit
		buffer[1+offset] = value >> 7;
		return 2;
	}else if(value < 2097152){
		buffer[0+offset] = value | 128;
		buffer[1+offset] = (value >> 7) | 128;
		buffer[2+offset] = value >> 14;
		return 3;
	}else if(value < 268435456){
		buffer[0+offset] = value | 128;
		buffer[1+offset] = (value >> 7) | 128;
		buffer[2+offset] = (value >> 14) | 128;
		buffer[3+offset] = value >> 21;
		return 4;
	}else{
		buffer[0+offset] = value | 128;
		buffer[1+offset] = (value >> 7) | 128;
		buffer[2+offset] = (value >> 14) | 128;
		buffer[3+offset] = (value >> 21) | 128;
		buffer[4+offset] = (value >> 28) & 15;
		return 5;
	}	
}

function writeLong(buffer, offset, value){

	var first = value, second = value >= 0 ? Math.floor(value / 2147483648) : Math.ceil(value / 2147483648);

	var sign = first > 0 ? 1 : -1;
	first = (sign*first) % 2147483648;
	
	first = sign*first;
	
	writeInt(buffer, offset, first);
	writeInt(buffer, offset+4, second);
}	

exports.readBoolean = readBoolean;
exports.writeBoolean = writeBoolean;

exports.readInt = readInt;
exports.writeInt = writeInt;

exports.readLong = readLong;
exports.writeLong = writeLong;

function writeUuidToBuffer(buf, off, uuid){
	if(uuid.length !== 8) throw new Error('UUID has wrong length: ' + uuid.length + ' ' + uuid)
	var i=off
	for(var ci=0;ci<8;++ci){
		var c = uuid.charCodeAt(ci)
		buf[(i++)] = c & 0xFF
		buf[(i++)] = (c>>8) & 0xFF
	}
}
exports.writeUuid = writeUuidToBuffer

exports.writeString = writeString
function writeString(buf, off, str){
	var len = Buffer.byteLength(str)
//	console.log('len: ' + len + ' ' + buf.length)
	//writeUnsignedIntCompactly(len)
	writeInt(buf, off, len)
	off += 4
	buf.write(str, off)
	return off+len
}
exports.stringLen = function(str){
	//console.log('*len: ' + Buffer.byteLength(str))
	return 4 + Buffer.byteLength(str)
}

exports.readString = readString
function readString(buf, off){
	var len = readInt(buf, off)
	return {
		str: readUtf8(buf, off+4, len),//buf.toString(off+4, len),
		off: off+len+4
	}
	//buf.write(str, off)
}

var BadStr = '[object Uint8Array]'
function readUtf8(cur, off, len){
	if(cur.constructor !== Uint8Array){
		var str = cur.toString('utf8', off, off+len);
		if(str !== BadStr || (len === BadStr.length && cur.toString() !== str)){
			return str
		}
	}
	//console.log('str: ' + str)
	var td = new TextDecoder('utf-8')
	return td.decode(cur.subarray(off,off+len));
}
exports.readUtf8 = readUtf8

exports.readData = function(size, rs, cb, errorCb, endCb){

	var bigBuffer = new Buffer(size);
	var bigOffset = 0;
	var bigEndOffset = 0;

	rs.on('data', function(data){
	
		if(data.length > bigBuffer.length - bigEndOffset){
			if(bigEndOffset === bigOffset){
				//there is no buffered data, just replace
				var nb = new Buffer(Math.max(bigBuffer.length, data.length));
				bigOffset = 0;
				bigEndOffset = 0;				

				bigBuffer = nb;
			}else{
				//expand if necessary, and copy buffered data back to beginning
				var nb = new Buffer(Math.max(bigBuffer.length, (bigEndOffset-bigOffset)+data.length));
				
				bigBuffer.copy(nb, 0, bigOffset, bigEndOffset);
				bigEndOffset = (bigEndOffset - bigOffset);
				bigOffset = 0;
				
				bigBuffer = nb;
			}
		}
			
		data.copy(bigBuffer, bigEndOffset, 0);
		bigEndOffset += data.length;
	
		var used = cb(bigBuffer, bigOffset, (bigEndOffset-bigOffset));
		bigOffset += used;
	});

	if(endCb){
		rs.on('end', endCb);
	}
};


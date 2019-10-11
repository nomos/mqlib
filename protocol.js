const StringDecoder = require('string_decoder').StringDecoder;
const decoder = new StringDecoder('utf8');
const Buffer = require('buffer').Buffer;
let protocol = {};

module.exports = protocol;

protocol.encode = function (msg) {
    let ret = [msg.serverid,msg.handler,msg.id,msg];
    return ret;
};

protocol.decode = function (msg) {
    let ret = {
        serverid:decoder.write(msg[0]),
        handler:decoder.write(msg[1]),
        id:decoder.write(msg[2]),
        msg:decoder.write(msg[3])
    };
    return ret;
};

protocol.getStringFromBuffer = function (buffer) {
    return decoder.write(buffer);
};

protocol.createStringBuffer = function (serverid) {
    return Buffer.from(serverid);
};

protocol.createTypeBuffer = function (type) {
    let buff = Buffer.alloc(1);
    buff.writeUInt8(type);
    return buff;
};

protocol.getMsgIDFromBuffer = function (buffer) {
    return decoder.write(buffer);
};

protocol.createMsgIDBuffer = function (msgid) {
    return Buffer.from(msgid);
};

protocol.getCodeFromBuffer = function (buff) {
    return buff.readInt32BE(0);
};

protocol.createCodeBuffer = function (code) {
    let buff = Buffer.alloc(4);
    buff.writeInt32BE(code,0);
    return buff;
};

protocol.createMsgHeader = function (serverid,type) {
    let msg = [];
    msg.push(Buffer.from(serverid));
    msg.push(Buffer.alloc(0));
    msg.push(this.createTypeBuffer(type));
    return msg;
};

protocol.createHandlerBuffer = function (handlers) {
    let str = '';
    for (let i=0;i<handlers.length;i++) {
        str+=handler[i];
        if (i<handlers.length-1) {
            str+='|';
        }
    }
    return Buffer.from(str);
};

protocol.getHandlerFromBuffer = function (buffer) {
    let str = decoder.write(buffer);
    return str.split('|');
};
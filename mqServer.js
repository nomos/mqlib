const zmq = require('zeromq');
const logger = require('../logger').logger('mq');
const crypto = require('../utils/crypto');
const mqlib = require('./mqlib');
const Buffer = require('buffer').Buffer;
const protocol = require('./protocol');

const ROUTETIMEOUT = 3000;
let port = parseInt(process.env.port);
let RouterServer = function () {
    //前端请求路由
    this.reqRouterFront = zmq.socket('router');
    //后端请求路由
    this.reqRouterBack = zmq.socket('router');
    //消息发布器
    this.publisher = zmq.socket('pub');
    this.routers = {};
    this.services = {};

    this.reqRouterFront.indentity = 'reqfrontend'+process.env.pid;
    this.reqRouterBack.indentity = 'rebackend'+process.env.pid;
    this.publisher.indentity = 'publisher'+process.env.pid;
    this.reqRouterFront.bindSync('tcp://*:' + (port+0));
    this.reqRouterBack.bindSync('tcp://*:' + (port+1));
    this.publisher.bindSync('tcp://*:' + (port+2));
    this.init();

    logger.debug(`消息队列启动\n前端端口:${port}\n后端端口:${port+1}\n发布端口:${port+2}\n`);
};

module.exports = RouterServer;

let pro = RouterServer.prototype;


pro.isRouterExists = function (name,handler) {
    if (!this.routers[name]) {
        return false;
    }
    if (Date.now()-this.routers[name].updateTime>ROUTETIMEOUT) {
        return false;
    }
    return !!this.routers[name][handler]
};

//[地址头,空帧,typeid<byte>,service<str>,handler<str>,msgid<int64>,code,msg]
pro.init = function () {
    let self = this;
    //前端消息队列接口
    //1.路由检测
    //2.后端服务路由包插入
    //3.前端服务路由包储存
    this.reqRouterFront.on('message',function () {
        let args=[].slice.call(arguments);
        logger.debug('收到消息',args);
        if (!args[1]||args[1].length>0) {
            logger.error('空帧检测错误,丢弃数据包');
            return;
        }
        let msgtype=args[2].readUInt8(0);
        if (msgtype===mqlib.MessageType.REQ) {
            this.onFrontEndRequest(args);
        } else if (msgtype===mqlib.MessageType.REQBALANCE) {
            this.onFrontEndRequestBalanced(args)
        } else {
            logger.error('消息类型出错');
            if (msgtype===mqlib.MessageType.NULL) {
                logger.error('消息类型未定义');
            } else if (msgtype===mqlib.MessageType.REP) {
                logger.error('前端请求器不应该接受响应');
            } else if (msgtype===mqlib.MessageType.HEART) {
                logger.error('后端请求器不应该发心跳包');
            } else if (msgtype===mqlib.MessageType.REGSERVICE) {
                logger.error('后端请求器不应该发路由注册');
            }
        }
    }.bind(this));
    //后端消息队列接口
    //1.路由注册 redis缓存
    //2.
    this.reqRouterBack.on('message',function () {
        let args = [].slice.call(arguments);
        if (!args[1]||args[1].length>0) {
            logger.error('空帧检测错误,丢弃数据包');
            return;
        }
        let msgtype=args[2].readUInt8(0);
        if (msgtype===mqlib.MessageType.REP) {
            this.onBackEndReply(args);
        } else if (msgtype===mqlib.MessageType.HEART) {
            this.onBackEndHeartBeats(args);
        } else if (msgtype===mqlib.MessageType.REGSERVICE) {
            this.onBackEndRegisterService(args);
        } else {
            logger.error('消息类型出错');
            if (msgtype===mqlib.MessageType.REQ) {
                logger.error('后端请求器不应该接受请求');
            } else if (msgtype===mqlib.MessageType.REQBALANCE) {
                logger.error('后端请求器不应该接受请求负载均衡');
            } else if (msgtype===mqlib.MessageType.REQUPDATE) {
                logger.error('后端请求器不应该发路由更新');
            } else if (msgtype===mqlib.MessageType.NULL) {
                logger.error('消息类型未定义');
            }
        }
    }.bind(this));
};

//前端响应

//点对点请求,最常用的路由收发
//接收到的格式: [req from,empty,typeid,route to,handler,msgid,msg]
//发送的格式: [route to,empty,req from,handler,msgid,msg]
pro.onFrontEndRequest = function (args) {
    logger.debug('onFrontEndRequest',args);
    [args[0],args[4]] = [args[4],args[0]];
    this.reqRouterBack.send(args);
};

//前端负载均衡请求,适用于无状态的后端服务
//接收到的格式: [req from,empty,typeid,serviceid,handler,msgid,msg]
//发送的格式: [route to,empty,req from,handler,msgid,msg]
pro.onFrontEndRequestBalanced = function (args) {
    logger.debug('onFrontEndRequestBalanced',args);
    let service = protocol.getStringFromBuffer(args[3]);
    let msgid = protocol.getMsgIDFromBuffer(args[5]);
    let serverid = this.balanceToService(msgid);

};

pro.balanceToService = function (msgid) {

};

//后端响应
//接收到的格式: [rep from,empty,typeid,req from,handler,msgid,code,msg]
//发送的格式: [route to,empty,msgid,code,msg]
pro.onBackEndReply = function (args) {
    logger.debug('onBackEndReply',args);
    let msg = protocol.createMsgHeader(mqlib.MessageType.REP);
    msg.push(args[5]);
    msg.push(args[6]);
    msg.push(args[7]);
    this.reqRouterFront.send(msg);
};

//后端服务每一秒钟刷新一次路由,写入到redis或者mongodb
//接受到的格式: [send from,empty,typeid,hash]
pro.onBackEndHeartBeats = function (args) {
    logger.debug('onBackEndRegisterService',args);
    let name = protocol.getStringFromBuffer(args[0]);
    let md5 = protocol.getStringFromBuffer(args[3]);
    if (!this.routers[name]) {
        logger.error('未发现注册路由:',name);
    } else if (this.routers[name].md5!==md5) {

    } else {
        this.routers[name].updateTime  = Date.now();
    }
};

//后端注册服务
//接收到的格式: [send from,empty,typeid,services,gameServices,handlers]
//发送的格式: [send from,empty,msgid,code,msg]
pro.onBackEndRegisterService = function (args) {
    logger.debug('onBackEndRegisterService',args);
    let serviceName = protocol.getStringFromBuffer(args[4]);
    let serverid = protocol.getStringFromBuffer(args[0]);
    let handlers = protocol.getHandlerFromBuffer(args[5]);
    let res = this.registerService(serviceName,serverid,handlers);
    [args[3],args[4]] = [args[4],args[3]];
    args.splice(4);
    if (res) {
        res.push(protocol.createCodeBuffer(200));
        res.push(protocol.createStringBuffer('OK'));
    } else {
        res.push(protocol.createCodeBuffer(500));
        res.push(protocol.createStringBuffer('Failed'));
    }
    this.reqRouterFront.send(args);
};

pro.registerService = function (service,name,handlers) {
    this.routers[name] = {};
    let handlerMergeStr = '';
    for (let i=0;i<handlers.length;i++) {
        this.routers[name] = handlers[i];
        handlerMergeStr+=handlers[i]
    }
    this.routers[name].hash = crypto.md5(handlerMergeStr);
    this.services[service] = this.services[service]||{};
    this.services[service][name] = this.routers[name];
    return true;
};

new RouterServer();














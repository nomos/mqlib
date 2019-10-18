const zmq = require('zeromq');
const logger = require('../logger').logger('mq');
const oid = require('bson').ObjectID;
const protocol = require('./protocol');

let requestWorker = function (pool) {
    this.pool = pool;
    this.id = 0;
    this.retrytimes = 0;
    this.client = zmq.socket('req');
    this.msg = null;
    this.cb = null;
    this.received = true;
    this.timeoutHandler = null;
};

module.exports = requestWorker;

let pro = requestWorker.prototype;

pro.setIndentity = function (id) {
    this.client.identity = id;
};

pro.init = function () {
    let self = this;
    this.client.moniter(500,0);
    this.client.on('connect',function (fd,ep) {
        logger.debug(self.client.identity +' connect, endpoint:', ep);
        self.retrytimes = 0;
        self.connected = true;
    });

    this.client.on('disconnect',function (fd,ep) {
        this.timeoutHandler&&clearTimeout(this.timeoutHandler);
        //如果当前面有发送消息,断线则返回错误
        if (self.msg) {
            self.msg.cb(self.client.identity+ ' request worker disconnected');
            self.reset();
            return;
        }
        self.connected = false;
        setTimeout(function() { self.connect(self.url); }, Math.pow(2, self.retrytimes)*1000);
        self.retrytimes++;
    });

    this.client.on('message',function (msg) {
        logger.debug(self.client.identity,' on message:',msg);
        self.onReceiveReply(msg);
    });

    this.client.on('connect_delay', function(fd, ep) {
        logger.debug(self.client.identity,' connect_delay, endpoint:', ep);
    });

    this.client.on('connect_retry', function(fd, ep) {
        logger.debug(self.client.identity,' connect_delay, endpoint:', ep);
    });
};

pro.connect = function (url) {
    this.client.connect(url);
    this.url = url;
};

pro.close = function () {
    this.client.close();
};

//收到请求回应
pro.onReceiveReply = function (msg) {
    this.timeoutHandler&&clearTimeout(this.timeoutHandler);
    if (this.received) {
        logger.debug(this.client.identity,' 收到多余信息');
        return;
    }
    let msg = protocol.decode(msg);
    if (this.msg) {
        if (msg.id === this.msg.id) {
            this.received = true;
            this.msg.cb&&this.msg.cb(null,msg.msg);
        }
    }
};

//发送消息格式 [{路由信息{}},{消息体}]
//路由信息[]
pro.sendRequest = async function(msgtype,service,handler,msg,cb) {
    if (!this.received) {
        logger.error('命令未返回');
        throw new Error('Worker命令未返回');
    }
    this.received = false;
    this.timeoutHandler = setTimeout(function () {
        if (this.received) {
            return;
        }
        if (this.msg&&this.msg.cb) {
            this.msg.cb(this.msg.service+':'+this.msg.handler+':'+this.msg.msg+':timeout');
        }
        this.reset();
    }.bind(this),this.pool.timeoutTime);
    let id = oid();
    if (this.connected) {
        this.client.send([msgtype,service,handler,id,msg]);
    } else {
        this.setMessage(msgtype,service,handler,id,msg,cb);
    }
};

pro.setMessage = function (msgtype,service,handler,id,msg,cb) {
    this.msg = {
        msgtype:msgtype,
        service:service,
        handler:handler,
        id:id,
        msg:msg,
        cb:cb
    };
};

pro.reset = function () {
    this.msg = null;
    this.received = true;
    if (this.timeoutHandler) {
        clearTimeout(this.timeoutHandler);
    }
    this.pool.freeWorker(this);
};





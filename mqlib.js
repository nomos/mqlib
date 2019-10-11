let mqlib = {};

mqlib.MessageType = {
    NULL:0,
    HEART:1,        //服务端维持心跳
    REQUPDATE:2,    //请求服务端更新路由
    REGSERVICE:3,    //服务端注册服务
    REQ:4,          //请求服务(需指定服务端)
    REQBALANCE:5,   //负载均衡请求(需指定服务类型)
    REP:6,          //服务器响应
};

module.exports = mqlib;
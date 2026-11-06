const http = require('node:http');
const target = new URL(process.env.GIS_TARGET || 'http://localhost:8888');
if (target.protocol !== 'http:') throw Error('GIS_TARGET must use http for the local Vite server');
function headers(req) { return { ...req.headers, host: target.host }; }
function proxyHttp(req,res) {
 const upstream=http.request({hostname:target.hostname,port:target.port||80,path:req.url,method:req.method,headers:headers(req)}, reply=>{
  res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
 });
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});res.end('GIS 开发服务未连接，请启动 '+target.origin);});
 upstream.setTimeout(30000,()=>upstream.destroy());
 req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
}
function proxyUpgrade(req,socket,head) {
 const upstream=http.request({hostname:target.hostname,port:target.port||80,path:req.url,method:req.method,headers:headers(req)});
 upstream.on('upgrade',(reply,peer,upstreamHead)=>{
  socket.write('HTTP/1.1 '+reply.statusCode+' '+reply.statusMessage+'\r\n'+Object.entries(reply.headers).map(([k,v])=>k+': '+v+'\r\n').join('')+'\r\n');
  if(upstreamHead.length)socket.write(upstreamHead);if(head.length)peer.write(head);
  peer.on('error',()=>socket.destroy());socket.on('error',()=>peer.destroy());
  socket.on('close',()=>peer.destroy());peer.on('close',()=>socket.destroy());socket.pipe(peer).pipe(socket);
 });
 upstream.on('response',reply=>{socket.end('HTTP/1.1 '+reply.statusCode+' Rejected\r\nConnection: close\r\n\r\n');reply.resume();});
 upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());upstream.end();
}
module.exports={proxyHttp,proxyUpgrade};

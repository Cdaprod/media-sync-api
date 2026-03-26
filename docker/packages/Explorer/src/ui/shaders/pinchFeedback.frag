precision highp float;
varying vec2 v_uv;

uniform vec2  u_res;
uniform float u_aspect;
uniform float u_time;
uniform vec2  u_a;
uniform vec2  u_b;
uniform float u_active;
uniform float u_fade;
uniform float u_pulse;
uniform float u_pulse_dir;

float adist(vec2 p, vec2 c) {
  vec2 d = p - c; d.x *= u_aspect; return length(d);
}
float ring(vec2 p, vec2 c, float r, float iw, float ow) {
  float d = adist(p, c);
  return smoothstep(r-iw,r,d)*(1.-smoothstep(r,r+ow,d));
}
float blob(vec2 p, vec2 c, float r) {
  float d = adist(p,c); return exp(-d*d/(r*r)*4.2);
}
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa=p-a,ba=b-a;
  float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);
  vec2 d=pa-ba*h; d.x*=u_aspect; return length(d);
}
float segT(vec2 p, vec2 a, vec2 b) {
  vec2 ba=b-a;
  return clamp(dot(p-a,ba)/max(dot(ba,ba),1e-7),0.,1.);
}
float hash21(vec2 p) {
  p=fract(p*vec2(127.1,311.7)); p+=dot(p,p+19.19);
  return fract(p.x*p.y);
}

void main() {
  vec2 uv=v_uv; float fade=u_fade;
  vec2 a=u_a, b=u_b;
  vec3 col=vec3(0.); float alpha=0.;

  float ringR=0.072, innerW=0.003, outerW=0.009;
  float breath=1.+0.013*sin(u_time*3.2);

  float rA=ring(uv,a,ringR*breath,innerW,outerW);
  float rB=ring(uv,b,ringR*breath,innerW,outerW);
  float gA=blob(uv,a,ringR*.60), gB=blob(uv,b,ringR*.60);
  float dotA=1.-smoothstep(.003,.007,adist(uv,a));
  float dotB=1.-smoothstep(.003,.007,adist(uv,b));

  vec3 ringCol=vec3(.28,.72,1.), glowCol=vec3(.12,.45,.95), dotCol=vec3(.75,.92,1.);
  col+=(rA+rB)*ringCol*.95; alpha=max(alpha,max(rA,rB)*.92);
  col+=(gA+gB)*glowCol*.32; alpha=max(alpha,max(gA,gB)*.20);
  col+=(dotA+dotB)*dotCol;  alpha=max(alpha,max(dotA,dotB));

  float sep=adist(a,b);
  float bridgeFade=smoothstep(0.,.14,sep);
  float sd=sdSeg(uv,a,b), t=segT(uv,a,b);
  float taper=smoothstep(0.,.14,t)*smoothstep(1.,.86,t);
  float core=(1.-smoothstep(.000,.005,sd))*taper*bridgeFade;
  float halo=(1.-smoothstep(.005,.028,sd))*taper*bridgeFade;
  float energy=.72+.28*sin(t*12.-u_time*4.);
  vec3 bridgeCol=vec3(.20,.65,1.);
  col+=bridgeCol*core*energy*.90; alpha=max(alpha,core*energy*.88);
  col+=bridgeCol*halo*.28;        alpha=max(alpha,halo*.22);

  for(int i=1;i<=3;i++){
    float nt=float(i)*.25;
    vec2 np=mix(a,b,nt);
    float pole=smoothstep(0.,.20,min(adist(np,a),adist(np,b)));
    float nodeR=.007+pole*.005;
    float nd=adist(uv,np);
    float nDot=1.-smoothstep(nodeR*.55,nodeR,nd);
    float nRng=ring(uv,np,nodeR+.005,.0015,.004);
    float nGlw=blob(uv,np,nodeR*2.8);
    vec3 nodeCol=mix(vec3(.35,.78,1.),vec3(.60,.94,1.),pole);
    col+=nodeCol*nDot*bridgeFade;       alpha=max(alpha,nDot*bridgeFade);
    col+=nodeCol*nRng*.55*bridgeFade;   alpha=max(alpha,nRng*.50*bridgeFade);
    col+=nodeCol*nGlw*.18*bridgeFade;   alpha=max(alpha,nGlw*.14*bridgeFade);
  }

  if(u_pulse>.001){
    float pT=u_pulse;
    float pR=ringR+(1.-pT)*.11;
    float pA=ring(uv,a,pR,.002,mix(.016,.006,pT))*pT;
    float pB=ring(uv,b,pR,.002,mix(.016,.006,pT))*pT;
    vec3 pCol=u_pulse_dir>0.?vec3(.22,1.,.52):vec3(1.,.52,.18);
    col+=pCol*(pA+pB)*.95; alpha=max(alpha,(pA+pB)*.90);
    float bFlash=halo*taper*pT*.7*bridgeFade;
    col+=pCol*bFlash;      alpha=max(alpha,bFlash*.55);
  }

  float grain=(hash21(uv*u_res+u_time*47.3)-.5)*.025;
  alpha=clamp(alpha*fade+grain*fade,0.,1.);
  col=col*fade;
  gl_FragColor=vec4(col,alpha);
}

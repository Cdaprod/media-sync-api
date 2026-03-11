const VERT=`
precision highp float;

attribute vec2 a_uv;

uniform float u_time;
uniform float u_progress;
uniform float u_stageMix;
uniform vec2  u_viewport;

varying vec3 v_worldPos;
varying vec3 v_normal;
varying vec2 v_uv;
varying float v_height;
varying float v_stageMix;
varying float v_mass;
varying float v_rimMask;

vec2 hash2(vec2 p){
  p = vec2(
    dot(p, vec2(127.1, 311.7)),
    dot(p, vec2(269.5, 183.3))
  );
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

float softBlob(vec2 p, vec2 c, float r, float blur){
  float d = length(p - c);
  return 1.0 - smoothstep(r, r + blur, d);
}

float blobField(vec2 p, float t, float stageMix){
  vec2 c0 = vec2(
    0.00 + 0.035 * sin(t * 0.55),
    0.00 + 0.030 * cos(t * 0.48)
  );

  vec2 c1 = vec2(
    -0.17 + 0.050 * sin(t * 0.72 + 0.8),
     0.10 + 0.045 * cos(t * 0.65 + 1.2)
  );

  vec2 c2 = vec2(
     0.18 + 0.055 * sin(t * 0.63 + 2.4),
     0.08 + 0.040 * cos(t * 0.57 + 0.4)
  );

  vec2 c3 = vec2(
    -0.08 + 0.045 * sin(t * 0.81 + 3.2),
    -0.18 + 0.055 * cos(t * 0.52 + 2.1)
  );

  vec2 c4 = vec2(
     0.12 + 0.050 * sin(t * 0.69 + 4.5),
    -0.12 + 0.040 * cos(t * 0.61 + 5.2)
  );

  float f = 0.0;
  f += softBlob(p, c0, mix(0.38, 0.46, stageMix), 0.22);
  f += softBlob(p, c1, mix(0.19, 0.24, stageMix), 0.18);
  f += softBlob(p, c2, mix(0.18, 0.25, stageMix), 0.18);
  f += softBlob(p, c3, mix(0.17, 0.22, stageMix), 0.18);
  f += softBlob(p, c4, mix(0.16, 0.22, stageMix), 0.18);

  f += fbm(p * 2.5 + vec2(t * 0.12, -t * 0.10)) * 0.18;
  return f;
}

float blobMask(vec2 p, float t, float stageMix){
  float f = blobField(p, t, stageMix);
  return smoothstep(0.44, 0.76, f);
}

float blobHeight(vec2 p, float t, float progress, float stageMix){
  float f = blobField(p, t, stageMix);

  float body = smoothstep(0.42, 0.86, f);
  float dome = pow(clamp(body, 0.0, 1.0), mix(1.8, 1.45, stageMix));

  float lowFreq = fbm(p * 1.8 + vec2(t * 0.10, -t * 0.08));
  float hiFreq  = fbm(p * 4.0 + vec2(-t * 0.06, t * 0.05));

  float breathing = mix(
    0.018 * sin(t * 1.10),
    0.030 * sin(t * 0.78 + 1.0),
    stageMix
  );

  float progressInflate = smoothstep(0.0, 1.0, progress) * mix(0.012, 0.032, stageMix);

  float centerBias = 1.0 - smoothstep(0.0, 0.95, length(p));

  return
    dome * mix(0.26, 0.34, stageMix) +
    lowFreq * 0.035 * body +
    hiFreq  * 0.015 * body +
    breathing * body +
    progressInflate * centerBias;
}

vec3 blobPos(vec2 uv, float t, float progress, float stageMix){
  vec2 p = uv;

  float mask = blobMask(p, t, stageMix);
  float h = blobHeight(p, t, progress, stageMix) * mask;

  vec2 g1 = vec2(
    blobField(p + vec2(0.010, 0.0), t, stageMix) - blobField(p - vec2(0.010, 0.0), t, stageMix),
    blobField(p + vec2(0.0, 0.010), t, stageMix) - blobField(p - vec2(0.0, 0.010), t, stageMix)
  );

  vec2 grad = normalize(g1 + vec2(1e-5));

  vec2 tangent = vec2(-grad.y, grad.x);

  float driftA = sin(t * 0.44 + p.x * 3.2 + p.y * 2.1);
  float driftB = sin(t * 0.57 - p.y * 2.8 + p.x * 1.6);

  vec2 lateral =
      tangent * 0.010 * driftA * mask * mix(0.50, 0.95, stageMix) +
      grad    * 0.006 * driftB * mask * mix(0.30, 0.55, stageMix);

  return vec3(p + lateral, h);
}

void main(){
  vec2 uv = a_uv;
  float eps = 0.006;

  vec3 p  = blobPos(uv, u_time, u_progress, u_stageMix);
  vec3 px = blobPos(uv + vec2(eps, 0.0), u_time, u_progress, u_stageMix);
  vec3 py = blobPos(uv + vec2(0.0, eps), u_time, u_progress, u_stageMix);

  vec3 dx = px - p;
  vec3 dy = py - p;
  vec3 n = normalize(cross(dx, dy));

  float mass = blobMask(uv, u_time, u_stageMix);
  float rimMask = smoothstep(0.20, 0.92, mass) - smoothstep(0.70, 1.02, mass);

  v_worldPos = p;
  v_normal = n;
  v_uv = uv;
  v_height = p.z;
  v_stageMix = u_stageMix;
  v_mass = mass;
  v_rimMask = rimMask;

  float aspect = u_viewport.x / max(1.0, u_viewport.y);

  vec2 clip = p.xy * 1.12;
  clip.x /= max(1.0, aspect * 0.98);

  float depthPush = p.z * 0.36;
  clip *= (1.0 + depthPush * 0.10);

  gl_Position = vec4(clip, p.z * 0.08, 1.0);
}
`;
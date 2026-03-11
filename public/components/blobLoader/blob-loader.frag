const FRAG=`
precision highp float;

uniform float u_time;
uniform float u_progress;
uniform float u_stageMix;

varying vec3 v_worldPos;
varying vec3 v_normal;
varying vec2 v_uv;
varying float v_height;
varying float v_stageMix;
varying float v_mass;
varying float v_rimMask;

float hash12(vec2 p){
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 paletteIndexing(float t){
  vec3 a = vec3(0.015, 0.045, 0.12);
  vec3 b = vec3(0.030, 0.150, 0.300);
  vec3 c = vec3(0.45, 0.78, 0.98);
  vec3 d = vec3(0.00, 0.18, 0.42);
  return a + b * cos(6.28318 * (c * t + d));
}

vec3 paletteThumbs(float t){
  vec3 a = vec3(0.030, 0.090, 0.180);
  vec3 b = vec3(0.120, 0.300, 0.440);
  vec3 c = vec3(0.80, 0.96, 1.00);
  vec3 d = vec3(0.06, 0.20, 0.46);
  return a + b * cos(6.28318 * (c * t + d));
}

void main(){
  float stageMix = u_stageMix;
  float progress = u_progress;

  vec3 N = normalize(v_normal);
  vec3 V = normalize(vec3(0.0, 0.0, 1.65) - v_worldPos);

  vec3 L1 = normalize(vec3(-0.55, 0.45, 1.30));
  vec3 L2 = normalize(vec3( 0.72,-0.18, 1.05));

  float mass = clamp(v_mass, 0.0, 1.0);
  float h = clamp(v_height * 3.2, 0.0, 1.0);

  vec3 colA = paletteIndexing(0.12 + h * 0.30 + 0.03 * sin(u_time * 0.30));
  vec3 colB = paletteThumbs(0.18 + h * 0.36 + 0.03 * sin(u_time * 0.24 + 1.1));
  vec3 baseCol = mix(colA, colB, stageMix);

  float ndl1 = max(dot(N, L1), 0.0);
  float ndl2 = max(dot(N, L2), 0.0);

  float fres = pow(1.0 - max(dot(N, V), 0.0), mix(2.6, 1.55, stageMix));
  float rim = pow(1.0 - max(dot(N, V), 0.0), mix(2.0, 1.25, stageMix));

  vec3 H1 = normalize(L1 + V);
  vec3 H2 = normalize(L2 + V);

  float spec1 = pow(max(dot(N, H1), 0.0), mix(28.0, 14.0, stageMix));
  float spec2 = pow(max(dot(N, H2), 0.0), mix(18.0, 10.0, stageMix));

  float pulse = mix(
    0.5 + 0.5 * sin(u_time * 1.7),
    0.5 + 0.5 * sin(u_time * 1.0 + 1.2),
    stageMix
  );

  vec3 deepBody = mix(
    vec3(0.01, 0.03, 0.10),
    vec3(0.02, 0.08, 0.18),
    stageMix
  );

  vec3 fluorescence = mix(
    vec3(0.10, 0.24, 0.92),
    vec3(0.18, 0.95, 0.98),
    stageMix
  );

  vec3 rimCol = mix(
    vec3(0.05, 0.30, 0.72),
    vec3(0.55, 0.92, 1.00),
    stageMix
  );

  float innerCore = pow(clamp(mass, 0.0, 1.0), mix(1.8, 1.2, stageMix));
  float shellBand = clamp(v_rimMask, 0.0, 1.0);

  vec3 col = vec3(0.0);

  col += deepBody * (0.35 + 0.40 * innerCore);
  col += baseCol * (0.18 + 0.55 * innerCore);

  col += baseCol * ndl1 * 0.24;
  col += baseCol * ndl2 * 0.12;

  col += fluorescence * pow(innerCore, mix(1.6, 0.95, stageMix)) * mix(0.42, 1.10, stageMix);
  col += fluorescence * pulse * smoothstep(0.30, 0.92, innerCore) * mix(0.06, 0.28, stageMix);

  col += rimCol * rim * shellBand * mix(0.26, 0.54, stageMix);
  col += rimCol * fres * mix(0.10, 0.34, stageMix);

  col += vec3(0.84, 0.94, 1.0) * spec1 * mix(0.12, 0.05, stageMix);
  col += vec3(0.62, 0.92, 1.0) * spec2 * mix(0.06, 0.03, stageMix);

  col += mix(
    vec3(0.00, 0.05, 0.10),
    vec3(0.02, 0.18, 0.18),
    stageMix
  ) * smoothstep(0.0, 1.0, progress) * (0.30 + 0.70 * pulse);

  float grain = hash12(gl_FragCoord.xy + u_time * 14.0);
  col += (grain - 0.5) * 0.010;

  float alpha = clamp(
    smoothstep(0.30, 0.88, mass) * (0.78 + 0.24 * fres),
    0.0, 1.0
  );

  gl_FragColor = vec4(col, alpha);
}
`;
/**
 * GLSL for the street surfaces (ROADS). Injected after `map_fragment` by patchGroundDetail (groundVariation.ts), so the
 * albedo it works on is already the photo / painted map times the soft world variation field. Everything here is albedo
 * only: no new texture, no new draw, no new triangle. Road-space features (wheel paths, gutters, utility cuts, tar snakes,
 * stop-line oil, steel plates, manholes) read the per-vertex info written by roadInfo.ts; surfaces without it (junction
 * polygons, the open ground) keep the world-space layers only.
 *
 * Scale rules (the owner's note: "the same decals at one scale and one contrast"): feature cells are 7 to 90 m long, hash
 * thresholds keep each kind rare, every shape has a noise-warped edge, and tone is a product of three octaves of
 * non-repeating value noise (5 m, 30 m and per-road), so no tile, grid or cell is readable from the street.
 */

/** helper functions every ground kind can use (after gdHash / gdNoise, which the patch declares) */
export const STREET_HELPERS_GLSL = `
float gdFbm( vec2 p ) { return gdNoise( p ) * 0.55 + gdNoise( p * 2.07 + 7.1 ) * 0.3 + gdNoise( p * 4.3 + 3.3 ) * 0.15; }
float gdBoxSd( vec2 p, vec2 h ) { vec2 d = abs( p ) - h; return length( max( d, 0.0 ) ) + min( max( d.x, d.y ), 0.0 ); }
`;

/** asphalt: the whole branch of the ground detail shader for kind 1 */
export const ASPHALT_GLSL = `
vec3 gdCol = diffuseColor.rgb;
float gdSeed = 0.37; float gdCls = 0.0; bool gdRoad = false; vec4 gdRd = vec4( 0.0 );
#ifdef USE_COLOR_ALPHA
  gdRd = vColor; gdCls = floor( gdRd.y ); gdSeed = fract( gdRd.y ); gdRoad = gdRd.x > 1.5 && gdRd.w > gdRd.z;
#endif
float gdTone = ( gdCls > 0.5 ? 0.8 : 1.0 ) * ( 0.92 + 0.16 * gdSeed );
float gdM1 = gdFbm( gw / 31.0 + gdSeed * 13.0 );
float gdM2 = gdFbm( gw / 6.5 + gdSeed * 5.0 );
gdTone *= 1.0 + ( gdM1 - 0.5 ) * 0.36 + ( gdM2 - 0.5 ) * 0.18;
gdCol *= mix( vec3( 1.03, 1.0, 0.96 ), vec3( 0.96, 1.0, 1.05 ), gdM1 );
if ( gdCls > 0.5 ) gdCol *= vec3( 0.95, 0.97, 1.03 );
if ( gdRoad ) {
  float rhw = gdRd.x; float rs0 = gdRd.z; float rs1 = gdRd.w;
  float rs = vGdUv.y * 3.0;
  float rc = vGdUv.x * 3.0 - rhw;
  float rk = rhw - abs( rc );
  float re = min( rs - rs0, rs1 - rs );
  float laneC = rhw < 4.4 ? 0.0 : clamp( ( rhw - 2.2 ) * 0.5, 1.5, 3.4 );
  float cl = rhw < 4.4 ? rc : rc - sign( rc ) * laneC;
  float traffic = gdCls > 0.5 ? 0.55 : 1.0;
  // worn lighter wheel paths and the dark oil line between them, patchy along the lane
  float wp = exp( -pow( ( abs( cl ) - 0.85 ) / 0.3, 2.0 ) ) * smoothstep( 1.0, 1.8, rk );
  float wn = 0.35 + 0.65 * gdNoise( vec2( rs * 0.13, rc * 0.2 + gdSeed * 9.0 ) );
  gdTone *= 1.0 + wp * wn * 0.11 * traffic;
  float mid = exp( -pow( cl / 0.24, 2.0 ) ) * smoothstep( 1.0, 1.8, rk );
  gdTone *= 1.0 - mid * 0.14 * smoothstep( 0.5, 0.85, gdNoise( vec2( rs * 0.6, gdSeed * 50.0 ) ) );
  // stop lines and junction approaches: brake dust, oil drips in the lane centres
  float sl = smoothstep( 13.0, 1.5, re );
  float oil = sl * smoothstep( 0.58, 0.82, gdNoise( vec2( rs * 1.1, cl * 3.2 ) + gdSeed * 20.0 ) ) * exp( -pow( cl / 1.1, 2.0 ) );
  gdTone *= ( 1.0 - sl * 0.07 ) * ( 1.0 - oil * 0.4 );
  // parked-car strip: less polished, a touch lighter
  gdTone *= 1.0 + 0.045 * smoothstep( 2.7, 1.5, rk ) * smoothstep( 0.6, 1.1, rk );
  // gutter grime along the kerb: brown-grey silt, ragged inner edge, grit
  float gwid = 0.35 + 0.5 * gdNoise( vec2( rs * 0.3, gdSeed * 30.0 ) );
  float gut = 1.0 - smoothstep( gwid * 0.35, gwid + 0.3, rk + ( gdNoise( vec2( rs * 2.0, rk * 3.0 ) ) - 0.5 ) * 0.3 );
  gdCol = mix( gdCol, gdCol * vec3( 0.64, 0.6, 0.54 ), gut * 0.8 );
  float grit = gdHash( floor( vec2( rs, rc ) * 24.0 ) );
  gdTone *= 1.0 + gut * ( grit > 0.93 ? 0.55 : -0.1 * grit );
  // tar-snake crack sealing along the road (rare, wavy, drawn in 16 m cells and faded at both ends)
  float tc = rs / 16.0 + gdSeed * 17.0; float ti = floor( tc ); float tf = fract( tc );
  if ( gdHash( vec2( ti, gdSeed * 91.0 ) ) > 0.6 ) {
    float lat = ( gdHash( vec2( ti + 3.0, gdSeed * 33.0 ) ) - 0.5 ) * 2.0 * max( rhw - 1.4, 0.2 );
    float wob = ( gdNoise( vec2( rs * 0.45, ti ) ) - 0.5 ) * 1.1 + ( gdNoise( vec2( rs * 2.3, ti ) ) - 0.5 ) * 0.12;
    float a0 = gdHash( vec2( ti + 9.0, 1.0 ) ) * 0.3; float a1 = 0.55 + gdHash( vec2( ti + 4.0, 2.0 ) ) * 0.45;
    float ext = smoothstep( a0, a0 + 0.07, tf ) * ( 1.0 - smoothstep( a1 - 0.07, a1, tf ) );
    float wdt = 0.016 + 0.02 * gdHash( vec2( ti, 5.0 ) );
    float line = ( 1.0 - smoothstep( wdt, wdt * 2.4, abs( rc - lat - wob ) ) ) * ext;
    gdTone *= 1.0 - line * 0.62;
  }
  // thermal cracks across the lanes, sealed, every few metres in places
  float sm = rs + gdSeed * 77.0; float xi = floor( sm / 7.0 ); float xh = gdHash( vec2( xi, gdSeed * 77.0 + 2.0 ) );
  if ( xh > 0.78 ) {
    float posm = ( xi + 0.2 + 0.6 * gdHash( vec2( xi, 3.0 ) ) ) * 7.0;
    float xd = abs( sm - posm + ( gdNoise( vec2( rc * 1.3, xi ) ) - 0.5 ) * 1.4 + ( gdNoise( vec2( rc * 7.0, xi ) ) - 0.5 ) * 0.1 );
    float la = mix( -rhw + 0.6, 0.0, gdHash( vec2( xi, 4.0 ) ) );
    float lb = la + 1.5 + gdHash( vec2( xi, 5.0 ) ) * rhw;
    float xline = ( 1.0 - smoothstep( 0.012, 0.034, xd ) ) * smoothstep( la, la + 0.3, rc ) * ( 1.0 - smoothstep( lb - 0.3, lb, rc ) );
    gdTone *= 1.0 - xline * 0.5;
  }
  // utility cuts: long narrow strips along a lane, sealed at the edges, darker (fresh) or lighter (old fill)
  float uc = ( rs + gdSeed * 131.0 ) / 37.0; float ui = floor( uc ); float uf = fract( uc ) * 37.0;
  float uh = gdHash( vec2( ui, gdSeed * 17.0 + 4.0 ) );
  if ( uh > 0.82 ) {
    float ua = 2.0 + gdHash( vec2( ui, 6.0 ) ) * 6.0;
    float ul = min( 8.0 + gdHash( vec2( ui, 7.0 ) ) * 18.0, 35.0 - ua );
    float ulat = ( laneC > 0.0 ? ( gdHash( vec2( ui, 8.0 ) ) > 0.5 ? laneC : -laneC ) : 0.0 ) + ( gdHash( vec2( ui, 9.0 ) ) - 0.5 ) * 1.4;
    float uhw = 0.26 + gdHash( vec2( ui, 10.0 ) ) * 0.22;
    float usd = gdBoxSd( vec2( uf - ua - ul * 0.5, rc - ulat ), vec2( ul * 0.5, uhw ) ) + ( gdNoise( vec2( rs * 3.0, rc * 3.0 ) ) - 0.5 ) * 0.04;
    float uin = 1.0 - smoothstep( -0.012, 0.012, usd );
    float useam = 1.0 - smoothstep( 0.0, 0.03, abs( usd + 0.025 ) );
    gdTone *= mix( 1.0, ( uh > 0.93 ? 1.2 : 0.76 ) * ( 0.92 + 0.16 * gdNoise( gw * 6.0 ) ), uin * 0.92 ) * ( 1.0 - useam * 0.42 );
  }
  // a trench cut across the whole roadway, very rare
  float zc = ( rs + gdSeed * 59.0 ) / 83.0; float zi = floor( zc ); float zf = fract( zc ) * 83.0;
  if ( gdHash( vec2( zi, gdSeed * 5.0 + 40.0 ) ) > 0.93 ) {
    float zp = 12.0 + gdHash( vec2( zi, 41.0 ) ) * 55.0;
    float zd = abs( zf - zp + ( gdNoise( vec2( rc * 0.8, zi ) ) - 0.5 ) * 0.2 );
    float zin = ( 1.0 - smoothstep( 0.3, 0.33, zd ) ) * step( abs( rc ), rhw - 0.4 );
    gdTone *= mix( 1.0, 0.8, zin ) * ( 1.0 - ( 1.0 - smoothstep( 0.0, 0.03, abs( zd - 0.31 ) ) ) * step( abs( rc ), rhw - 0.4 ) * 0.4 );
  }
  // repair patches: rare, irregular, large
  float pc = ( rs + gdSeed * 211.0 ) / 71.0; float pi = floor( pc ); float pf = fract( pc ) * 71.0;
  float ph = gdHash( vec2( pi, gdSeed * 3.0 + 20.0 ) );
  if ( ph > 0.9 ) {
    vec2 pctr = vec2( 12.0 + 45.0 * gdHash( vec2( pi, 21.0 ) ), ( gdHash( vec2( pi, 22.0 ) ) - 0.5 ) * max( rhw - 2.0, 0.5 ) * 2.0 );
    vec2 phs = vec2( 1.3 + 2.2 * gdHash( vec2( pi, 23.0 ) ), 0.9 + 1.3 * gdHash( vec2( pi, 24.0 ) ) );
    vec2 pq = vec2( pf, rc ) - pctr + ( vec2( gdNoise( gw * 0.9 ), gdNoise( gw * 0.9 + 5.0 ) ) - 0.5 ) * 0.7;
    float psd = gdBoxSd( pq, phs ) - 0.35;
    float pin = 1.0 - smoothstep( -0.03, 0.03, psd );
    gdTone *= mix( 1.0, ph > 0.96 ? 1.16 : 0.78, pin * 0.9 ) * ( 1.0 - ( 1.0 - smoothstep( 0.0, 0.05, abs( psd ) ) ) * 0.25 );
  }
  // steel road plate, 2.4 x 1.2 m, aligned with the lane
  float qc = ( rs + gdSeed * 97.0 ) / 53.0; float qi = floor( qc ); float qf = fract( qc ) * 53.0;
  if ( gdHash( vec2( qi, gdSeed * 7.0 + 60.0 ) ) > 0.9 ) {
    vec2 qctr = vec2( 14.0 + 25.0 * gdHash( vec2( qi, 61.0 ) ), ( gdHash( vec2( qi, 62.0 ) ) - 0.5 ) * max( rhw - 1.6, 0.4 ) * 2.0 );
    float qsd = gdBoxSd( vec2( qf, rc ) - qctr, vec2( 1.22, 0.61 ) );
    float qin = 1.0 - smoothstep( -0.005, 0.01, qsd );
    float qrim = 1.0 - smoothstep( 0.0, 0.07, -qsd );
    vec3 qcol = vec3( 0.2, 0.205, 0.215 ) * ( 0.82 + 0.3 * gdNoise( gw * 11.0 ) ) * ( 1.0 + 0.7 * qrim * qin ) * ( 1.0 + 0.06 * step( 0.5, fract( ( qf + rc ) * 9.0 ) ) );
    gdCol = mix( gdCol, qcol / max( gdTone, 0.3 ), qin );
    gdTone *= 1.0 - ( 1.0 - smoothstep( 0.0, 0.14, qsd ) ) * ( 1.0 - qin ) * 0.3;
  }
  // manhole cover (cast iron, 90 cm) on the lane, rare
  float hc = ( rs + gdSeed * 43.0 ) / 47.0; float hi = floor( hc ); float hf = fract( hc ) * 47.0;
  if ( gdHash( vec2( hi, gdSeed * 11.0 + 80.0 ) ) > 0.74 ) {
    vec2 hq = vec2( hf - 8.0 - 30.0 * gdHash( vec2( hi, 81.0 ) ), rc - ( laneC > 0.0 ? ( gdHash( vec2( hi, 82.0 ) ) > 0.5 ? laneC : -laneC ) * 0.35 : 0.0 ) - ( gdHash( vec2( hi, 83.0 ) ) - 0.5 ) * 0.8 );
    float hr = length( hq );
    float hin = 1.0 - smoothstep( 0.42, 0.46, hr );
    float hring = smoothstep( 0.34, 0.37, hr ) * hin;
    float hang = atan( hq.y, hq.x );
    float hgrid = step( 0.5, fract( hr * 9.0 ) ) * 0.25 + step( 0.82, abs( sin( hang * 6.0 ) ) ) * 0.2;
    vec3 hcol = vec3( 0.07, 0.065, 0.062 ) * ( 0.7 + 0.6 * gdNoise( gw * 14.0 ) ) * ( 1.0 + hgrid + hring * 0.6 );
    gdCol = mix( gdCol, hcol / max( gdTone, 0.3 ), hin );
    gdTone *= 1.0 - ( 1.0 - smoothstep( 0.46, 0.62, hr ) ) * ( 1.0 - hin ) * 0.25;
  }
} else {
  // junction polygons and unknown asphalt: sealed cracks along noise contours, big soft oil darkening, no cells
  float cn = gdNoise( gw * 0.55 + gdSeed * 4.0 ) * 0.75 + gdNoise( gw * 2.3 ) * 0.25;
  float line = ( 1.0 - smoothstep( 0.004, 0.011, abs( cn - 0.5 ) ) ) * smoothstep( 0.5, 0.72, gdNoise( gw * 0.09 + 3.1 ) );
  gdTone *= 1.0 - line * 0.5;
  gdTone *= 1.0 - 0.2 * smoothstep( 0.55, 0.9, gdNoise( gw * 0.33 + 8.0 ) );
}
// old cobbles showing through the asphalt: rare, noise-edged, a few metres across
vec2 kc = gw / 43.0; vec2 ki = floor( kc ); float kh = gdHash( ki + 71.0 );
if ( kh > 0.95 ) {
  vec2 kctr = vec2( 0.25 + gdHash( ki + 1.1 ) * 0.5, 0.25 + gdHash( ki + 2.2 ) * 0.5 );
  vec2 kq = ( fract( kc ) - kctr ) * 43.0 + ( vec2( gdNoise( gw * 0.8 ), gdNoise( gw * 0.8 + 3.1 ) ) - 0.5 ) * 1.2;
  float ksd = gdBoxSd( kq, vec2( 1.2 + gdHash( ki + 3.3 ) * 2.0, 1.0 + gdHash( ki + 4.4 ) * 1.4 ) );
  float km = 1.0 - smoothstep( -0.05, 0.08, ksd );
  vec3 kcol = vec3( 0.4, 0.385, 0.36 ) * dtlGain( 2.0, gw / 2.4, 1.5 ) * ( 0.75 + 0.5 * gdNoise( gw * 0.7 ) );
  gdCol = mix( gdCol, kcol, km * 0.85 );
}
diffuseColor.rgb = gdCol * gdTone;
`;

/** concrete sidewalk (kind 2) and bluestone flags (kind 5; GD_FLAG defined): slabs from the UV grid, so the joints in the map and the tone agree */
export const SIDEWALK_GLSL = `
vec3 gdCol = diffuseColor.rgb;
float gdSeed = 0.0; bool gdSw = false; vec4 gdRd = vec4( 0.0 );
#ifdef USE_COLOR_ALPHA
  gdRd = vColor; gdSeed = gdRd.y; gdSw = true;
#endif
#ifdef GD_FLAG
  vec2 sg = vec2( vGdUv.x * 3.0, vGdUv.y * 2.0 );
  float slabM = 0.9;
#else
  vec2 sg = vGdUv * 2.0;
  float slabM = 1.5;
#endif
vec2 sc = floor( sg ); vec2 sf = fract( sg );
float sd = gdHash( sc + gdSeed * 97.0 + 5.0 );
float sd2 = gdHash( sc * 1.7 + gdSeed * 53.0 + 9.0 );
float gdTone = 1.0 + ( sd - 0.5 ) * 0.24;
#ifdef GD_FLAG
  // quarried flags: each its own blue-grey or buff, bedding lines, ragged lighter edges, and the odd replaced concrete patch
  gdCol *= mix( vec3( 0.95, 0.99, 1.06 ), vec3( 1.08, 1.0, 0.9 ), sd2 );
  gdTone *= 0.9 + 0.2 * gdNoise( sg * vec2( 3.0, 11.0 ) + sc * 2.3 );
  gdTone *= 1.0 - 0.14 * smoothstep( 0.55, 0.85, gdNoise( sg * 6.0 + sc * 5.0 ) );
  if ( sd > 0.95 ) gdCol = mix( gdCol, vec3( 0.5, 0.5, 0.48 ) * ( 0.9 + 0.2 * gdNoise( gw * 20.0 ) ), 0.85 );
  float flagEdge = min( min( sf.x, 1.0 - sf.x ) * 0.9, min( sf.y, 1.0 - sf.y ) * 1.5 );
  gdTone *= 1.0 - 0.3 * ( 1.0 - smoothstep( 0.0, 0.035, flagEdge ) );
  gdTone *= 1.0 + 0.05 * smoothstep( 0.03, 0.09, flagEdge ) * ( 1.0 - smoothstep( 0.09, 0.2, flagEdge ) );
#else
  if ( sd > 0.93 ) { gdTone *= 1.13; gdCol = mix( gdCol, vec3( dot( gdCol, vec3( 0.3333 ) ) ), 0.4 ); }
  else if ( sd < 0.07 ) { gdTone *= 0.8; gdCol *= vec3( 1.05, 1.0, 0.9 ); }
  gdCol *= mix( vec3( 1.03, 1.01, 0.97 ), vec3( 0.97, 1.0, 1.04 ), sd2 );
#endif
gdTone *= 1.0 + ( gdNoise( sg * 1.6 + sc * 3.1 ) - 0.5 ) * 0.2;
gdTone *= 1.0 + ( gdFbm( gw / 17.0 + gdSeed * 11.0 ) - 0.5 ) * 0.2;
// water pooling and drips: a grimy low corner on some slabs
float stainAmt = smoothstep( 0.62, 0.9, gdHash( sc + gdSeed * 13.0 + 31.0 ) ) * ( 0.3 + 0.7 * gdNoise( sg * 3.0 + sc ) );
gdCol *= mix( vec3( 1.0 ), vec3( 0.8, 0.77, 0.72 ), stainAmt * smoothstep( 0.2, 1.0, sf.y ) * 0.8 );
// cracks: a few slabs, wandering from a corner, tar-sealed hairline
float ch = gdHash( sc + gdSeed * 31.0 + 2.0 );
if ( ch > 0.78 ) {
  vec2 cp = sf - vec2( step( 0.5, sd2 ), step( 0.5, fract( sd2 * 7.0 ) ) );
  float ca = 0.5 + ch * 2.4 + sd2 * 1.2;
  vec2 cdir = vec2( cos( ca ), sin( ca ) );
  float ct = dot( cp, cdir ); float cn2 = dot( cp, vec2( -cdir.y, cdir.x ) );
  float clen = 0.35 + 0.65 * fract( ch * 13.0 );
  cn2 += ( gdNoise( sg * 8.0 + 3.0 ) - 0.5 ) * 0.06 + ( gdNoise( sg * 31.0 ) - 0.5 ) * 0.015;
  float cline = ( 1.0 - smoothstep( 0.0035, 0.011, abs( cn2 ) ) ) * smoothstep( 0.0, 0.05, ct ) * ( 1.0 - smoothstep( clen - 0.12, clen, ct ) );
  gdTone *= 1.0 - cline * ( ch > 0.92 ? 0.62 : 0.4 );
}
// chewing gum: sparse, in clusters, pale halo
vec2 gc = gw / 0.42; vec2 gi = floor( gc );
float gcl = smoothstep( 0.42, 0.8, gdNoise( gw * 0.07 + 4.0 ) );
if ( gdHash( gi + 41.0 ) > 0.993 - 0.035 * gcl ) {
  float gd2 = length( fract( gc ) - vec2( 0.5 ) ) * 0.42;
  float gr = 0.014 + 0.012 * gdHash( gi + 42.0 );
  gdTone *= 1.0 - ( 1.0 - smoothstep( gr * 0.8, gr * 1.6, gd2 ) ) * 0.42;
}
// kerb silt and the building line: from the per-vertex info where it exists
float kerbM = 9.0; float bldT = 0.0;
#ifdef USE_COLOR_ALPHA
  if ( gdRd.z > 0.0 ) {
    vec2 bm = vGdUv * vec2( GD_UVM_X, GD_UVM_Y );
    kerbM = min( min( bm.x, gdRd.z - bm.x ), min( bm.y, gdRd.w - bm.y ) );
  } else { kerbM = gdRd.x * 3.2; bldT = smoothstep( 0.86, 1.0, gdRd.x ); }
#endif
float kerbG = 1.0 - smoothstep( 0.0, 0.35 + 0.25 * gdNoise( gw * 1.7 ), kerbM );
gdCol *= mix( vec3( 1.0 ), vec3( 0.78, 0.75, 0.7 ), kerbG * 0.8 );
gdTone *= 1.0 - bldT * ( 0.14 + 0.16 * gdNoise( gw * 2.1 ) ) - 0.05 * smoothstep( 0.5, 0.0, kerbM );
diffuseColor.rgb = gdCol * gdTone;
`;

/** lane paint (kind 3): chipped and worn toward the asphalt in places, repainted bright in others */
export const PAINT_GLSL = `
vec2 fc = floor( gw / 17.0 ); float fh = gdHash( fc + 51.0 );
float fade = fh > 0.8 ? 1.22 : ( fh < 0.32 ? 0.58 + 0.25 * gdNoise( gw * 3.0 ) : 1.0 );
float wearN = gdNoise( gw * 6.5 ) * 0.55 + gdNoise( gw * 21.0 ) * 0.3 + gdNoise( gw * 61.0 ) * 0.15;
float wearLow = gdNoise( gw * 0.17 + 2.0 );
float chip = smoothstep( 0.52, 0.74, wearN * ( 0.55 + 0.8 * wearLow ) + ( fh < 0.32 ? 0.12 : 0.0 ) );
vec3 paintCol = diffuseColor.rgb * fade * ( 0.94 + 0.12 * gdNoise( gw * 2.0 ) );
diffuseColor.rgb = mix( paintCol, vec3( 0.16, 0.165, 0.17 ), chip * 0.7 );
`;

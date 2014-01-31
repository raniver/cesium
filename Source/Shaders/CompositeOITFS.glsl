/**
 * Compositing for Weighted Blended Order-Independent Transparency. See:
 * http://jcgt.org/published/0002/02/09/
 */
 
uniform sampler2D u_opaque;
uniform sampler2D u_accumulation;
uniform sampler2D u_revealage;

varying vec2 v_textureCoordinates;

void main()
{
    vec4 opaque = texture2D(u_opaque, v_textureCoordinates);
    vec4 accum = texture2D(u_accumulation, v_textureCoordinates);
    float r = texture2D(u_revealage, v_textureCoordinates).r;
    
#ifdef MRT
    vec4 transparent = vec4(accum.rgb / clamp(r, 1e-4, 5e4), accum.a);
#else
    vec4 transparent = vec4(accum.rgb / clamp(accum.a, 1e-4, 5e4), r);
#endif
    
    transparent.rgb = mix(vec3(0.0), transparent.rgb, pow(1.0 - transparent.a, 2.0));
    gl_FragColor = (1.0 - transparent.a) * transparent + transparent.a * opaque;
}
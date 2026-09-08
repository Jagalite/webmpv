// Experimental RGB upload. mpv still renders decoded pixels, filters and subtitles.
class RGBUpload {
  constructor() {
    this.canvas=new OffscreenCanvas(1,1);
    this.gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
    const gl=this.gl;if(!gl)throw Error('WebGL2 unavailable');
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const vertex=shader(gl.VERTEX_SHADER,`#version 300 es
    out vec2 uv;
    void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=vec2(p.x,1.0-p.y);gl_Position=vec4(p*2.0-1.0,0,1);}`);
    const fragment=shader(gl.FRAGMENT_SHADER,`#version 300 es
    precision highp float;
    uniform sampler2D pixels;in vec2 uv;out vec4 color;
    void main(){color=vec4(texture(pixels,uv).rgb,1.0);}`);
    const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.deleteShader(vertex);gl.deleteShader(fragment);gl.useProgram(program);
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
    if(gl.getError()!==gl.NO_ERROR)throw Error('RGB upload initialization failed');
  }
  draw(context,bytes,width,height) {
    const gl=this.gl;if(gl.isContextLost())return false;
    if(this.canvas.width!==width||this.canvas.height!==height){
      this.canvas.width=width;this.canvas.height=height;gl.viewport(0,0,width,height);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    }
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    gl.drawArrays(gl.TRIANGLES,0,3);context.drawImage(this.canvas,0,0);
    return true;
  }
}

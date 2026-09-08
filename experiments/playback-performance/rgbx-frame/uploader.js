// A raw-pixel presentation experiment; FFmpeg still performs all video decoding.
// The existing ImageData path remains available without the VideoFrame API.
export class RGBXFrameUploader {
  constructor(Frame=globalThis.VideoFrame) {
    this.Frame=Frame;this.active=typeof Frame==='function';
    this.stats={created:0,closed:0,drawn:0,failures:0};
  }
  draw(context,bytes,width,height,timestamp=0) {
    if(!this.active)return false;
    let frame;
    try {
      frame=new this.Frame(bytes,{format:'RGBX',codedWidth:width,codedHeight:height,
        timestamp,colorSpace:{primaries:'bt709',transfer:'iec61966-2-1',matrix:'rgb',fullRange:true}});
      this.stats.created++;
      context.drawImage(frame,0,0);this.stats.drawn++;
      return true;
    } catch(error) {
      this.active=false;this.stats.failures++;this.stats.reason=String(error);
      return false;
    } finally {
      if(frame){frame.close();this.stats.closed++;}
    }
  }
}

import {serve as base} from '../pipeline-qualification/server.mjs';
export const serve=()=>base({pagePath:'experiments/software-yuv-integration/page.html',mediaPaths:process.env.BENCH_MEDIA_ROOT?{movie:process.env.BENCH_MEDIA_ROOT+'/movie.mp4'}:{}});

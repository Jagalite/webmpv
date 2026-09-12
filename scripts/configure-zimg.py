#!/usr/bin/env python3
"""Build upstream's portable source list without host autotools or SIMD assembly."""
from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent
source = root / 'build/sources/zimg'
out = root / 'build/zimg-cmake'
out.mkdir(exist_ok=True)
makefile = (source / 'Makefile.am').read_text()
portable = makefile.split('libzimg_internal_la_SOURCES =', 1)[1].split('libzimg_internal_la_CPPFLAGS', 1)[0]
files = re.findall(r'src/[\w/]+\.cpp', portable)
assert len(files) >= 20
prefix = root / 'build/prefix-playback'
pc = (source / 'zimg.pc.in').read_text()
for key, value in {'prefix': str(prefix), 'exec_prefix': '${prefix}', 'libdir': '${prefix}/lib',
                   'includedir': '${prefix}/include', 'VERSION': '3.0.6', 'STL_LIBS': '-lstdc++'}.items():
    pc = pc.replace('@' + key + '@', value)
(out / 'zimg.pc').write_text(pc)
(out / 'CMakeLists.txt').write_text('''cmake_minimum_required(VERSION 3.16)
project(webmpv_zimg LANGUAGES CXX)
add_library(zimg STATIC
''' + '\n'.join('"' + str(source / f) + '"' for f in files) + '''
)
target_compile_features(zimg PRIVATE cxx_std_14)
target_compile_options(zimg PRIVATE -O2 -pthread -msimd128 -fexceptions)
target_include_directories(zimg PRIVATE "''' + str(source / 'src/zimg') + '''")
install(TARGETS zimg ARCHIVE DESTINATION lib)
install(FILES "''' + str(source / 'src/zimg/api/zimg.h') + '''" DESTINATION include)
install(FILES "${CMAKE_CURRENT_SOURCE_DIR}/zimg.pc" DESTINATION lib/pkgconfig)
''')

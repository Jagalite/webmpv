# Runtime assets and package integration

The assetBase/copy-assets interfaces are implemented in this working candidate.
The project is not yet published to npm. Install the locally assembled archive:

```sh
npm run build
python3 scripts/package-beta.py --output build/my-candidate
# In a clean application:
npm install /absolute/path/to/webmpv-0.3.0-beta.2.tgz
npx webmpv copy-assets public/assets/webmpv
```

```js
import {Player} from 'webmpv';
const player = new Player(container, {assetBase:'/assets/webmpv/'});
// Optional, separate UI entry:
import {definePlayerElement} from 'webmpv/player';
definePlayerElement();
```

```html
<webmpv-player controls asset-base="/assets/webmpv/"></webmpv-player>
```

assetBase is the package runtime root containing web/, fixtures/, third_party/
and LICENSE. Its trailing slash is normalized. It is resolved against the page
base URL; same-origin HTTP(S) is required. The old static-directory installation
works without assetBase when generated modules retain their package paths.
Bundled applications should always provide assetBase. All inspector/worker entry
points, nested workers, engine modules/Wasm, AudioWorklet and fonts follow the
copied tree. Route-dependent loading is retained; core import and construction
perform no engine downloads. Import during SSR is safe; construction is browser-only.
The UI entry does not register anything until definePlayerElement is called.

copy-assets validates every package manifest hash before copying runtime assets,
font and notices. It writes webmpv-runtime.json with version and hashes. It never
deletes destination files; unrelated collisions and symlink paths reject. Updates
may replace only previous manifest-owned unmodified assets. Retain the generated
manifest with the installation. Use core and runtime from the same archive; mixing
releases or experimental presenters is unsupported. Failed copies should be rerun
from an intact package; use a versioned destination for atomic application rollout.

Serve JS/mjs as text/javascript, Wasm as application/wasm and fonts with font/ttf.
Worker routes require a secure context and COOP: same-origin plus COEP: require-corp.
Native direct can work without isolation. Media must satisfy CORS, range/identity
and source allowlist requirements. CSP must permit same-origin module scripts and
workers, Wasm compilation (wasm-unsafe-eval), same-origin worker-owner iframes,
AudioWorklet, fonts and authorized media/connect origins. Native local/remux media
needs media-src blob:. Component styles use a shadow style element; deployments
with strict style-src need an appropriate hash or policy for those shipped styles.
No consumer service worker is installed. The Pages isolation worker is demo-only.
Arbitrary CDN worker roots, Safari/mobile, PiP/casting and physical output fidelity
remain separate qualification gates. See LICENSING.md and RELEASE.md for source
and clean-engine-build obligations; this integration does not close them.

// us-atlas (TopoJSON) -> GeoJSON con solo 50 stati + DC; id FIPS e nome come proprietà
const fs = require('fs'); const topo = require('topojson-client');
const [,, inp, out] = process.argv;
const t = JSON.parse(fs.readFileSync(inp));
const terr = new Set(['60','66','69','72','78']);
const fc = topo.feature(t, t.objects.states);
fc.features = fc.features.filter(f => !terr.has(String(f.id).padStart(2,'0'))).map(f => ({ type:'Feature', properties:{ id:String(f.id).padStart(2,'0'), name:f.properties.name }, geometry:f.geometry }));
fs.writeFileSync(out, JSON.stringify(fc)); console.log(fc.features.length,'stati');

// us-atlas contee (TopoJSON) -> GeoJSON con id FIPS a 5 cifre, solo 50 stati + DC
const fs = require('fs'); const topo = require('topojson-client');
const [,, inp, out] = process.argv;
const t = JSON.parse(fs.readFileSync(inp));
const terr = new Set(['60','66','69','72','78']);
const fc = topo.feature(t, t.objects.counties);
fc.features = fc.features.filter(f => !terr.has(String(f.id).padStart(5,'0').slice(0,2)))
  .map(f => ({ type:'Feature', properties:{ id:String(f.id).padStart(5,'0'), name:f.properties.name }, geometry:f.geometry }));
fs.writeFileSync(out, JSON.stringify(fc)); console.log(fc.features.length,'contee');

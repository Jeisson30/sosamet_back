const fs = require('fs');
const p =
  '../sosamet/src/app/features/gestion/pages/ejecucion-cortes/assign-ejecucion-cortes/assign-ejecucion-cortes.component.ts';
let t = fs.readFileSync(p, 'utf8');

const start = t.indexOf('if (!this.todosAdicionalesChecked)');
if (start < 0) {
  console.log('block not found');
  process.exit(0);
}
const end = t.indexOf('if (!this.empresaSelectedId)', start);
if (end < 0) {
  console.log('end not found');
  process.exit(1);
}
t = t.slice(0, start) + t.slice(end);
fs.writeFileSync(p, t);
console.log(
  'removed',
  !fs.readFileSync(p, 'utf8').includes('todosAdicionalesChecked')
);

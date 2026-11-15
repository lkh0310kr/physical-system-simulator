/** 3MF (3D Manufacturing Format): 슬라이서가 바로 여는 ZIP 컨테이너. 한 파일에 여러 부품(베이스·뚜껑)을 담는다. 단위 mm. */
import type { Mesh } from "./geometry.ts";
import { zip } from "./zip.ts";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function write3mf(objects: readonly { name: string; mesh: Mesh }[]): Uint8Array {
  const enc = new TextEncoder();
  const resources = objects
    .map(({ name, mesh }, i) => {
      const v: string[] = [];
      for (let k = 0; k < mesh.positions.length; k += 3) {
        v.push(
          `<vertex x="${mesh.positions[k]}" y="${mesh.positions[k + 1]}" z="${mesh.positions[k + 2]}"/>`,
        );
      }
      const t: string[] = [];
      for (let k = 0; k < mesh.indices.length; k += 3) {
        t.push(
          `<triangle v1="${mesh.indices[k]}" v2="${mesh.indices[k + 1]}" v3="${mesh.indices[k + 2]}"/>`,
        );
      }
      return `<object id="${i + 1}" type="model" name="${esc(name)}"><mesh><vertices>${v.join("")}</vertices><triangles>${t.join("")}</triangles></mesh></object>`;
    })
    .join("");
  const build = objects.map((_, i) => `<item objectid="${i + 1}"/>`).join("");
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${resources}</resources><build>${build}</build></model>`;
  return zip([
    {
      name: "[Content_Types].xml",
      data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
      ),
    },
    {
      name: "_rels/.rels",
      data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
      ),
    },
    { name: "3D/3dmodel.model", data: enc.encode(model) },
  ]);
}

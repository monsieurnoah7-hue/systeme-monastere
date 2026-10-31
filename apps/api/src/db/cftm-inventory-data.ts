// Données d'inventaire officiel CFTM intégrées par l'Administration & Ingénierie Logistique
// Généré automatiquement à partir des relevés certifiés du 26/10/2026

export interface CftmToolItem {
  id: string;
  name: string;
  category: string;
  location: string;
  magasin_id: string;
  condition: string;
  status: string;
  brand?: string;
  model?: string;
}

export interface CftmStockItem {
  name: string;
  category: string;
  unit: string;
  location: string;
  magasin_id: string;
  min_qty: number;
  initial_qty: number;
  brand?: string;
  supplier?: string;
}

export const CFTM_TOOLS: CftmToolItem[] = [
  {
    "id": "CFTM-MAC-001",
    "name": "Aspirateur ED 1509",
    "category": "Machine Électroportative",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "condition": "bon",
    "status": "disponible",
    "brand": "ED"
  },
  {
    "id": "CFTM-MAC-002",
    "name": "Meuleuse",
    "category": "Machine Électroportative",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-MAC-003",
    "name": "Perceuse à Percution 20 V",
    "category": "Machine Électroportative",
    "location": "Casier W",
    "magasin_id": "MAG-019",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-MAC-004",
    "name": "Perceuse à Percution 20 V",
    "category": "Machine Électroportative",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-MAC-005",
    "name": "Perceuse rotative",
    "category": "Machine Électroportative",
    "location": "Casier W",
    "magasin_id": "MAG-019",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-MAC-006",
    "name": "Perceuse sans fils du Lithum ion (S12)",
    "category": "Machine Électroportative",
    "location": "Casier W",
    "magasin_id": "MAG-019",
    "condition": "bon",
    "status": "disponible",
    "model": "S12"
  },
  {
    "id": "CFTM-MAC-007",
    "name": "Perceuse viseuse",
    "category": "Machine Électroportative",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-MAC-008",
    "name": "Pistolet à air EMTOP 16 mm",
    "category": "Machine Électroportative",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "condition": "bon",
    "status": "disponible",
    "brand": "EMTOP"
  },
  {
    "id": "CFTM-MAC-009",
    "name": "Pistolet vitre",
    "category": "Machine Électroportative",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-MAC-010",
    "name": "Viceuse sans fils 12 V",
    "category": "Machine Électroportative",
    "location": "Casier W",
    "magasin_id": "MAG-019",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-MAC-011",
    "name": "Visseuse avec batterie",
    "category": "Machine Électroportative",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-OUT-012",
    "name": "88 PIECES TOOLS SET",
    "category": "Outillage Manuel",
    "location": "Casier W",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-OUT-013",
    "name": "Bédane (Paquet de 12 manche en bois)",
    "category": "Outillage Manuel",
    "location": "Casier HI",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "model": "Paquet de 12 manche en bois"
  },
  {
    "id": "CFTM-OUT-014",
    "name": "Cisaille à fleur",
    "category": "Outillage Manuel",
    "location": "Magasin Central",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-OUT-015",
    "name": "Ciseaux à bois Emtop (jeux de 4 dans un paquet)",
    "category": "Outillage Manuel",
    "location": "Casier BC",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "brand": "EMTOP",
    "model": "jeux de 4 dans un paquet"
  },
  {
    "id": "CFTM-OUT-016",
    "name": "Equerre d'angle 5cm",
    "category": "Outillage Manuel",
    "location": "Magasin Central",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-OUT-017",
    "name": "Jeu de tournevis poignés",
    "category": "Outillage Manuel",
    "location": "Magasin Central",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-OUT-018",
    "name": "Macette total (Manche verte)",
    "category": "Outillage Manuel",
    "location": "Casier CD",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "brand": "TOTAL",
    "model": "Manche verte"
  },
  {
    "id": "CFTM-OUT-019",
    "name": "Marteau 25g (25g)",
    "category": "Outillage Manuel",
    "location": "Magasin Central",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "model": "25g"
  },
  {
    "id": "CFTM-OUT-020",
    "name": "Marteau 30g (30g)",
    "category": "Outillage Manuel",
    "location": "Magasin Central",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "model": "30g"
  },
  {
    "id": "CFTM-OUT-021",
    "name": "Marteau 4kg (4kg)",
    "category": "Outillage Manuel",
    "location": "Magasin Central",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "model": "4kg"
  },
  {
    "id": "CFTM-OUT-022",
    "name": "Marteau 500g (500g Emtop)",
    "category": "Outillage Manuel",
    "location": "Magasin Central",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "brand": "EMTOP",
    "model": "500g Emtop"
  },
  {
    "id": "CFTM-OUT-023",
    "name": "Marteau à Pression Dera",
    "category": "Outillage Manuel",
    "location": "Magasin Central",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "brand": "Dera"
  },
  {
    "id": "CFTM-OUT-024",
    "name": "Marteau Perforateur (Rotary Hammer 800W)",
    "category": "Outillage Manuel",
    "location": "Casier W",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "model": "Rotary Hammer 800W"
  },
  {
    "id": "CFTM-OUT-025",
    "name": "Pulverisateur",
    "category": "Outillage Manuel",
    "location": "Magasin Central",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-OUT-026",
    "name": "Racloir + scie XPert",
    "category": "Outillage Manuel",
    "location": "Magasin Central",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "brand": "XPert"
  },
  {
    "id": "CFTM-OUT-027",
    "name": "Ralonge 8 ports Blanc",
    "category": "Outillage Manuel",
    "location": "Magasin Central",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-OUT-028",
    "name": "Scie à main Egoïne (Marque Emtop)",
    "category": "Outillage Manuel",
    "location": "Casier JJ",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "brand": "EMTOP",
    "model": "Marque Emtop"
  },
  {
    "id": "CFTM-OUT-029",
    "name": "Scie à métaux",
    "category": "Outillage Manuel",
    "location": "Casier EF",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible"
  },
  {
    "id": "CFTM-OUT-030",
    "name": "Tenail Pince à Feuillure Emtop (en plastique)",
    "category": "Outillage Manuel",
    "location": "Casier DE",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "brand": "EMTOP",
    "model": "en plastique"
  },
  {
    "id": "CFTM-OUT-031",
    "name": "Tournevis Emtop (2 en 1 Marque)",
    "category": "Outillage Manuel",
    "location": "Casier JJ",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "brand": "EMTOP",
    "model": "2 en 1 Marque"
  },
  {
    "id": "CFTM-OUT-032",
    "name": "Tournevis Emtop (Jeux de 6)",
    "category": "Outillage Manuel",
    "location": "Casier DE",
    "magasin_id": "MAG-027",
    "condition": "bon",
    "status": "disponible",
    "brand": "EMTOP",
    "model": "Jeux de 6"
  }
];

export const CFTM_STOCK_REFS: CftmStockItem[] = [
  {
    "name": "Mousse PH2_1 (PH2 de 1cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 0,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH2_12 (PH2 de 12cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 4,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH2_17 (PH2 de 17cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 1,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH2_2 (PH2 de 2cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 7,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH2_3 (PH2 de 3cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 15,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH2_4 (PH2 de 4cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 0,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH2_4 (PH2 de 4cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 13,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH2_5 (PH2 de 5cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 3,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH2_6 (PH2 de 6cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 3,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH7_10 (PH7 de 10cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 1,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH7_12 (PH7 de 12cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 0,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH7_14 (PH7 de 14cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 2,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH7_16 (PH7 de 16cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 1,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH7_2 (PH7 de 2cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 0,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH7_3 (PH7 de 3cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 5,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH7_4 (PH7 de 4cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 10,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH7_5 (PH7 de 5cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 1,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH7_6 (PH7 de 6cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 0,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Mousse PH7_7 (PH7 de 7cm)",
    "category": "Mousses & Rembourrage",
    "unit": "pièce",
    "location": "Zone Mousses",
    "magasin_id": "MAG-021",
    "min_qty": 2,
    "initial_qty": 1,
    "supplier": "Fournisseur Mousses Douala",
    "brand": "PH Mousse"
  },
  {
    "name": "Contre Plaqués Formicalisés (Épaisseur de 04mm)",
    "category": "Contreplaqués",
    "unit": "pièce",
    "location": "Racks Panneaux",
    "magasin_id": "MAG-022",
    "min_qty": 2,
    "initial_qty": 0,
    "supplier": "Scieries & Négoce Bois",
    "brand": "Ayous / Sappeli / Formica"
  },
  {
    "name": "Contre Plaqués Blancs Ayous (Épaisseur de 04 mm)",
    "category": "Contreplaqués",
    "unit": "pièce",
    "location": "Racks Panneaux",
    "magasin_id": "MAG-022",
    "min_qty": 2,
    "initial_qty": 5,
    "supplier": "Scieries & Négoce Bois",
    "brand": "Ayous / Sappeli / Formica"
  },
  {
    "name": "Contre Plaqués Sappeli Double Face (Épaisseur de 05 mm)",
    "category": "Contreplaqués",
    "unit": "pièce",
    "location": "Racks Panneaux",
    "magasin_id": "MAG-022",
    "min_qty": 2,
    "initial_qty": 25,
    "supplier": "Scieries & Négoce Bois",
    "brand": "Ayous / Sappeli / Formica"
  },
  {
    "name": "Panneaux Blancs Ayous (Épaisseur de 12 mm)",
    "category": "Panneaux Dérivés",
    "unit": "pièce",
    "location": "Racks Panneaux",
    "magasin_id": "MAG-022",
    "min_qty": 2,
    "initial_qty": 0,
    "supplier": "Scieries & Négoce Bois",
    "brand": "Ayous / Sappeli / Formica"
  },
  {
    "name": "Panneaux Blancs Ayous (Épaisseur de 08 mm)",
    "category": "Panneaux Dérivés",
    "unit": "pièce",
    "location": "Racks Panneaux",
    "magasin_id": "MAG-022",
    "min_qty": 2,
    "initial_qty": 3,
    "supplier": "Scieries & Négoce Bois",
    "brand": "Ayous / Sappeli / Formica"
  },
  {
    "name": "Panneaux Blancs Ayous (Épaisseur de 10 mm)",
    "category": "Panneaux Dérivés",
    "unit": "pièce",
    "location": "Racks Panneaux",
    "magasin_id": "MAG-022",
    "min_qty": 2,
    "initial_qty": 1,
    "supplier": "Scieries & Négoce Bois",
    "brand": "Ayous / Sappeli / Formica"
  },
  {
    "name": "Panneaux Blancs Ayous (Épaisseur de 14 mm)",
    "category": "Panneaux Dérivés",
    "unit": "pièce",
    "location": "Racks Panneaux",
    "magasin_id": "MAG-022",
    "min_qty": 2,
    "initial_qty": 2,
    "supplier": "Scieries & Négoce Bois",
    "brand": "Ayous / Sappeli / Formica"
  },
  {
    "name": "Panneaux Blancs Ayous (Épaisseur de 15 mm)",
    "category": "Panneaux Dérivés",
    "unit": "pièce",
    "location": "Racks Panneaux",
    "magasin_id": "MAG-022",
    "min_qty": 2,
    "initial_qty": 7,
    "supplier": "Scieries & Négoce Bois",
    "brand": "Ayous / Sappeli / Formica"
  },
  {
    "name": "Panneaux Blancs Ayous (Épaisseur de 16 mm)",
    "category": "Panneaux Dérivés",
    "unit": "pièce",
    "location": "Racks Panneaux",
    "magasin_id": "MAG-022",
    "min_qty": 2,
    "initial_qty": 7,
    "supplier": "Scieries & Négoce Bois",
    "brand": "Ayous / Sappeli / Formica"
  },
  {
    "name": "Panneaux Blancs Ayous (Épaisseur de 18 mm)",
    "category": "Panneaux Dérivés",
    "unit": "pièce",
    "location": "Racks Panneaux",
    "magasin_id": "MAG-022",
    "min_qty": 2,
    "initial_qty": 13,
    "supplier": "Scieries & Négoce Bois",
    "brand": "Ayous / Sappeli / Formica"
  },
  {
    "name": "Panneaux Formicalisés (Épaisseur de 22 mm)",
    "category": "Panneaux Dérivés",
    "unit": "pièce",
    "location": "Racks Panneaux",
    "magasin_id": "MAG-022",
    "min_qty": 2,
    "initial_qty": 0,
    "supplier": "Scieries & Négoce Bois",
    "brand": "Ayous / Sappeli / Formica"
  },
  {
    "name": "Panneaux Formicalisés (Épaisseur de 18 mm)",
    "category": "Panneaux Dérivés",
    "unit": "pièce",
    "location": "Racks Panneaux",
    "magasin_id": "MAG-022",
    "min_qty": 2,
    "initial_qty": 0,
    "supplier": "Scieries & Négoce Bois",
    "brand": "Ayous / Sappeli / Formica"
  },
  {
    "name": "Panneaux Formicalisés (Épaisseur de 15 mm)",
    "category": "Panneaux Dérivés",
    "unit": "pièce",
    "location": "Racks Panneaux",
    "magasin_id": "MAG-022",
    "min_qty": 2,
    "initial_qty": 0,
    "supplier": "Scieries & Négoce Bois",
    "brand": "Ayous / Sappeli / Formica"
  },
  {
    "name": "Disque  auto collant N° 40 (N° 40 / 180)",
    "category": "Abrasifs & Ponçage",
    "unit": "Piece",
    "location": "Casier A1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Disque à poncer N° 24",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Disque à poncer N° 36",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 30
  },
  {
    "name": "Disque à poncer N° 80",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier abrasif en bande N° 60 (boite de 5 de 115 X 280 N*60)",
    "category": "Abrasifs & Ponçage",
    "unit": "boite",
    "location": "Casier C2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 35
  },
  {
    "name": "Papier abrasif en disque N° 90 (N° 90 auto agrippant paquet 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier abrasif en feuilles (N° 600)",
    "category": "Abrasifs & Ponçage",
    "unit": "Boite de 50",
    "location": "Casier C2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 250
  },
  {
    "name": "Papier abrasif en feuille 180 (N° 180)",
    "category": "Abrasifs & Ponçage",
    "unit": "Paquet de 50",
    "location": "Casier E2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 1150
  },
  {
    "name": "Papier abrasif en feuille N°120 (N° 120)",
    "category": "Abrasifs & Ponçage",
    "unit": "Paquet de 50",
    "location": "Casier E2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 800
  },
  {
    "name": "Papier abrasif en feuille N°220 (V-06_N°220)",
    "category": "Abrasifs & Ponçage",
    "unit": "Pièce (boîte de 50)",
    "location": "Casier E2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 500
  },
  {
    "name": "Papier abrasif en feuille N°320 (V-07_N°320)",
    "category": "Abrasifs & Ponçage",
    "unit": "Pièce (boîte de 50)",
    "location": "Casier D2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 950
  },
  {
    "name": "Papier abrasif en feuille N°400 (V-08_N°400 paquet 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Pièce (boîte de 50)",
    "location": "Casier D2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 950
  },
  {
    "name": "Papier abrasif en rouleau  EU N° 60 (U-01_N°60 de  50m)",
    "category": "Abrasifs & Ponçage",
    "unit": "Rouleau",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier abrasif en rouleau DLA (U-03_N°120 en rouleau)",
    "category": "Abrasifs & Ponçage",
    "unit": "Rouleau (m)",
    "location": "Casier B2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 3
  },
  {
    "name": "Papier abrasif en rouleau DLA N° 60 (U-02_N°60 en rouleau)",
    "category": "Abrasifs & Ponçage",
    "unit": "Rouleau (m)",
    "location": "Casier B2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 6
  },
  {
    "name": "Papier Abrasif N° 240 (N° 240 carton de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier D2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 1300
  },
  {
    "name": "Papier Abrasif N° 240 (N°240)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier disque Grand N° 150 (Ref 150 Paquet de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier F4",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 130
  },
  {
    "name": "Papier disque Grand N° 180 (Ref 180 Paquet de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier F3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 1300
  },
  {
    "name": "Papier disque Grand N° 220 (Ref 220 Paquet de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier disque Grand N° 240 (Ref 240 Paquet de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier F3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier disque Grand N° 320 (Ref 320 Paquet de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier F3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier disque Grand N° 40 (Ref 40)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier A2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 110
  },
  {
    "name": "Papier disque Grand N° 400 (Ref 400 Paquet de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier disque N° 24 (Ref 120 paquet de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier F2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 9
  },
  {
    "name": "Papier Disque N° 36 (N° 36 carton de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier F1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier disque Petit N° 180 (Ref 180 Paquet de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier F2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 400
  },
  {
    "name": "Papier disque Petit N° 220 (Ref 220 Paquet de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier disque Petit N° 240 (Ref 240 Paquet de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier F2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier disque Petit N° 320 (Ref 320 Paquet de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier F2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier disque Petit N° 40 (Ref 40)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier A1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier disque Petit N° 400 (Ref 400 Paquet de 100)",
    "category": "Abrasifs & Ponçage",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Batterie (Betterie pour appareil portatif)",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Caisse Fraise Défonceuse 8 jeux 35 Pces",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Chanfrain",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Charbon pour machine (Taille confondu)",
    "category": "Accessoires & Consommables Machines",
    "unit": "Paquet",
    "location": "Casier AB",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 8
  },
  {
    "name": "Ciseaux de 10mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Ciseaux de 16mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Ciseaux de 25mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Couroies 12,5x1500 (12,5x1500 A57)",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Couroies 95x&èàà (95x1700)",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Disque coupant (125mm)",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Fer a rainure de 12",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Fer a rainure de 8",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Forêt de 20 mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Forêt de 4",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Lame de scie 25cm",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Lame de scie 30cm",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Lame de scie 35cm",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Lame de scie à mètau 144",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Lame de scie à mètau 244",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Lame de scie à ruban de 20 cm (20 cm)",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Lame de scie sauteuse (Scie sauteuse)",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Casier AB",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 93
  },
  {
    "name": "Meche à bois helicoïdale",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Mèche de 10 mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Meche de 12 mm (Lot de 12)",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Mèche de 12 mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Meche de 14 mm (Lot de 12)",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Mèche de 14 mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Meche de 15 mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Meche de 20 mm (Lot de 12)",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Méche de 3 mm (Boite de 10)",
    "category": "Accessoires & Consommables Machines",
    "unit": "Boite",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Meche de 3mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Mèche de 4 mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Méche de 5 mm (Boite de 10)",
    "category": "Accessoires & Consommables Machines",
    "unit": "Piece",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Méche de 5 mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Meche de 6 mm (Lot de 12)",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Mèche de 7 mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Mèche de 8",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Meche de 8 mm (Lot de 12)",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Mèche de 9 mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Pistolet à peindre INGCO",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Tambour de 180",
    "category": "Accessoires & Consommables Machines",
    "unit": "Unité",
    "location": "Casier CD",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 2
  },
  {
    "name": "Tambour de ponçage Gd 150 mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Casier CD",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Tambour de ponçage Pt 125 mm",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Casier CD",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 3
  },
  {
    "name": "Tuyau pour le compresseur en rouleau",
    "category": "Accessoires & Consommables Machines",
    "unit": "u",
    "location": "Casier Haut",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 1
  },
  {
    "name": "Bloc Serrure (Vachette)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier A2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Bloc_serrure de porte (entrée)",
    "category": "Accessoires de Meuble",
    "unit": "boite",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Blocs Serrure (MEGGO)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Blocs Serrure (AGOGO / JIALEDY)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Blocs Serrure (VILA)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Bouton argenté (argenté)",
    "category": "Accessoires de Meuble",
    "unit": "pièce",
    "location": "Casier T8",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 51
  },
  {
    "name": "Bouton dorés (AA-04)",
    "category": "Accessoires de Meuble",
    "unit": "Pieces",
    "location": "Casier T8",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 250
  },
  {
    "name": "Bouton en cuivre (AA-03)",
    "category": "Accessoires de Meuble",
    "unit": "Pieces",
    "location": "Casier T8",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Canon Ordinaire (80mm long)",
    "category": "Accessoires de Meuble",
    "unit": "boite",
    "location": "Casier B3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Canon simple 90mm (L=90mm)",
    "category": "Accessoires de Meuble",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Dongme de silence (Paquet)",
    "category": "Accessoires de Meuble",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Gache pour serrure meuble",
    "category": "Accessoires de Meuble",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 20
  },
  {
    "name": "Garniture de porte (inox)",
    "category": "Accessoires de Meuble",
    "unit": "boite (paire)",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Paumele invisible caché (mauvais etat)",
    "category": "Accessoires de Meuble",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Paumelle de porte (taille 105mm plate G)",
    "category": "Accessoires de Meuble",
    "unit": "paire",
    "location": "Casier C3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 30
  },
  {
    "name": "Paumelle de porte (taille 105mm plate D)",
    "category": "Accessoires de Meuble",
    "unit": "paire",
    "location": "Casier C3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 73
  },
  {
    "name": "Paumelles de porte sans main (taille 100mm argenté)",
    "category": "Accessoires de Meuble",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Poigné à cremole (avec 2 accessoieres)",
    "category": "Accessoires de Meuble",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Poigné meuble 15 cm",
    "category": "Accessoires de Meuble",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Poignée encastrrée dorée (taille 125mm)",
    "category": "Accessoires de Meuble",
    "unit": "pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 2
  },
  {
    "name": "Poignée tombant cuivrée (taille 120)",
    "category": "Accessoires de Meuble",
    "unit": "pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Poignée tombant dorée (taille 125)",
    "category": "Accessoires de Meuble",
    "unit": "pièce",
    "location": "Casier T4",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Poignet dorée rustique 130 mm (tissée taille 130)",
    "category": "Accessoires de Meuble",
    "unit": "pièce",
    "location": "Casier T10",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 10
  },
  {
    "name": "Poignet dorée rustique 95 mm (Arcanthe taille 95mm)",
    "category": "Accessoires de Meuble",
    "unit": "pièce",
    "location": "Casier T10",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 16
  },
  {
    "name": "Poignet en argent (AA-06)",
    "category": "Accessoires de Meuble",
    "unit": "Pieces",
    "location": "Casier T10",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 8
  },
  {
    "name": "Poignet en inox (GM) 130 (AA-01  taille 130)",
    "category": "Accessoires de Meuble",
    "unit": "pièces",
    "location": "Casier T7",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Poignet en inox (PM) 95 mm (AA-02  taille 95mm)",
    "category": "Accessoires de Meuble",
    "unit": "pièces",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Poignet en inox 65 mm (taille 65mm)",
    "category": "Accessoires de Meuble",
    "unit": "pièce",
    "location": "Casier T7",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 78
  },
  {
    "name": "Poignet encastré argenté 120 (AA-05 taille 120)",
    "category": "Accessoires de Meuble",
    "unit": "Pieces",
    "location": "Casier T10",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 7
  },
  {
    "name": "Poignet tombant dorée rustique (AA-08 taille 110x65mm)",
    "category": "Accessoires de Meuble",
    "unit": "Pieces",
    "location": "Casier T7",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 33
  },
  {
    "name": "Poignet tombant en cuivre 125 (AA-07 taille 125)",
    "category": "Accessoires de Meuble",
    "unit": "Pieces",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Roulettes meubles (Y-01_en plastic)",
    "category": "Accessoires de Meuble",
    "unit": "jeu de 4",
    "location": "Casier J2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Roulettes meubles (Y-02_en métal)",
    "category": "Accessoires de Meuble",
    "unit": "jeu de 4",
    "location": "Casier J2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure  Douche (JIALEDY AGOGO rond coudée)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure \"MEGGO\" poignets plats argentés à trois pênes ronds",
    "category": "Accessoires de Meuble",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure \"MEGGO\" poignets ronds et courbés à trois pênes ronds",
    "category": "Accessoires de Meuble",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure / meuble (L-01_Lock court)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce (boîte de 12)",
    "location": "Casier B3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 7
  },
  {
    "name": "Serrure / meuble (L-01-2_Lock long)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce (boîte de 12) à 36000",
    "location": "Casier B3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 288
  },
  {
    "name": "Serrure / meuble (L-02_à poussoir)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier B3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 3
  },
  {
    "name": "Serrure / meuble (L-03_à 3 points tiroir Tige)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier B3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure / meuble (L-04_à crochet)",
    "category": "Accessoires de Meuble",
    "unit": "pièces",
    "location": "Casier B3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure / meuble  Canon douche (L-05_de porte)",
    "category": "Accessoires de Meuble",
    "unit": "pièces",
    "location": "Casier B3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure de douche (complète)",
    "category": "Accessoires de Meuble",
    "unit": "boite",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure de porte (complète)",
    "category": "Accessoires de Meuble",
    "unit": "boite",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Douche (MEGGO sans motif plate lisse)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier A2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Douche (VILA rosace rond)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Douche (JIALEDY AGOGO effilé plat)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Douche (JIALEDY AGOGO plat)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Douche (JIALEDY AGOGO courbée (INTECG))",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure en applique",
    "category": "Accessoires de Meuble",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Ministre Moderne (MEGGO avec motif plate (Ministre))",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier A1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Ministre Moderne (MEGGO éffiléé rond)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier A2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Ordinaire Porte (JIALEDY Poigné rosace / AGOGO)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier A1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Ordnaire (MEGGO sans motif plate lisse)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Ordnaire Porte (MEGGO sans motif plate lisse)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier A2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Ordnaire Porte (MEGGO avec motif plate (Ministre))",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier A3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Ordnaire Porte (JIALEDY AGOGO effilé plat HUYHOANG)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Ordnaire Porte (JIALEDY AGOGO plat)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Ordnaire Porte (JIALEDY AGOGO courbée (INTECG))",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serrure Ordnaire Porte (MEGGO avec poignée enroulé rond)",
    "category": "Accessoires de Meuble",
    "unit": "Piece",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serure Everleo (Locksseries) Douche (Locks serie rouge)",
    "category": "Accessoires de Meuble",
    "unit": "Unité",
    "location": "Casier A2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serure Everleo (Locksseries)Normal (Locks serie rouge)",
    "category": "Accessoires de Meuble",
    "unit": "Unité",
    "location": "Casier A2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Support pour cintre (Avec 12 acroches et un pierd pour fixer)",
    "category": "Accessoires de Meuble",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Tagette moyenne maron",
    "category": "Accessoires de Meuble",
    "unit": "Unité",
    "location": "Casier H3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Targette (I-02_Plastique taille 35)",
    "category": "Accessoires de Meuble",
    "unit": "Pièce",
    "location": "Casier N3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 35
  },
  {
    "name": "Targette métallique (I-01_taille 60)",
    "category": "Accessoires de Meuble",
    "unit": "Boîte (12pces) à 4800",
    "location": "Casier N3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 121
  },
  {
    "name": "Crucifix en metal",
    "category": "Articles Funéraires",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Plastique cercueil (rouleau de 100m)",
    "category": "Articles Funéraires",
    "unit": "m",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Poigné doré pour cercueil (Avec croix et tire fond)",
    "category": "Articles Funéraires",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Poignée cercueil coupe americaine",
    "category": "Articles Funéraires",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Tirefon",
    "category": "Articles Funéraires",
    "unit": "unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Galet battant coulissant (D=22mm ; Ep=12mm)",
    "category": "Articulation & Coulissement",
    "unit": "pièce",
    "location": "Casier T4",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 55
  },
  {
    "name": "Glissières battant 1900 mm (1900 mm de long)",
    "category": "Articulation & Coulissement",
    "unit": "pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Rail / tiroir_25cm (25cm)",
    "category": "Articulation & Coulissement",
    "unit": "paire",
    "location": "Casier B1",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 71
  },
  {
    "name": "Rail / tiroir_30cm (M-01_métallique de 30cm)",
    "category": "Articulation & Coulissement",
    "unit": "Paire (paquet de 16) à 36000",
    "location": "Casier B1",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 45
  },
  {
    "name": "Rail / tiroir_35cm (M-02_métallique de 35cm)",
    "category": "Articulation & Coulissement",
    "unit": "Paire (paquet de 16) à 36000",
    "location": "Casier F1",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 59
  },
  {
    "name": "Rail / tiroir_40cm (M-03_métallique de 40cm)",
    "category": "Articulation & Coulissement",
    "unit": "Paire (paquet de 16) à 33600",
    "location": "Casier E1",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 68
  },
  {
    "name": "Rail / tiroir_45cm (M-04_métallique  de 45cm)",
    "category": "Articulation & Coulissement",
    "unit": "Paire (paquet de 16) à 36800",
    "location": "Casier D1/E1",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 40
  },
  {
    "name": "Rail / tiroir_50cm (M-05_métallique de 50cm)",
    "category": "Articulation & Coulissement",
    "unit": "Paire (paquet de 16) à 38400",
    "location": "Casier C1",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 56
  },
  {
    "name": "Colle Blanche (N-01_de 30kg)",
    "category": "Colles & Adhésifs",
    "unit": "Saut",
    "location": "Casier F4",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Colle blanche en bidon (Nemo durabond)",
    "category": "Colles & Adhésifs",
    "unit": "bidon de 20 kg",
    "location": "Casier I4",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Colle expensive (Sika de 25mm)",
    "category": "Colles & Adhésifs",
    "unit": "tube",
    "location": "Casier M2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 24
  },
  {
    "name": "Colle Forte (N-03_3L)",
    "category": "Colles & Adhésifs",
    "unit": "pot",
    "location": "Casier F4",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 3
  },
  {
    "name": "Colle Memo en bidon de 25 KG (Memo 25 kg)",
    "category": "Colles & Adhésifs",
    "unit": "Bidon",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Colle nemo 120 KG (En fût)",
    "category": "Colles & Adhésifs",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Colle Rapide (N-02_Boîte de 12)",
    "category": "Colles & Adhésifs",
    "unit": "Carton",
    "location": "Casier L2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 16
  },
  {
    "name": "Colle Rapide D4 (Magic bond 500g)",
    "category": "Colles & Adhésifs",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Colle Silicone blanc (N-05_Boîte de 12)",
    "category": "Colles & Adhésifs",
    "unit": "Tube",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Colle Silicone gris (N-04_Carton de 12)",
    "category": "Colles & Adhésifs",
    "unit": "Tube",
    "location": "Casier M3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Colle Silicone transparent (N-06_Boîte de 12)",
    "category": "Colles & Adhésifs",
    "unit": "Tube",
    "location": "Casier M3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 1
  },
  {
    "name": "Vitre claire de 4 mm",
    "category": "Divers & Bâtiment",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Ampoule",
    "category": "Électricité & Éclairage",
    "unit": "Piece",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Ampoule Led (30 Watt)",
    "category": "Électricité & Éclairage",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Ampoule Led (15 Watt)",
    "category": "Électricité & Éclairage",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Ampoule Maff (Maff)",
    "category": "Électricité & Éclairage",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Ampoule Vernissage (Vernissage)",
    "category": "Électricité & Éclairage",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Douille à porcellaire (Ref. Porce)",
    "category": "Électricité & Éclairage",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Reglet",
    "category": "Électricité & Éclairage",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Balai à manche",
    "category": "Entretien & Hygiène",
    "unit": "Piece",
    "location": "Casier ZZ",
    "magasin_id": "MAG-004",
    "min_qty": 5,
    "initial_qty": 20
  },
  {
    "name": "Balais à brindille",
    "category": "Entretien & Hygiène",
    "unit": "u",
    "location": "Casier Etage",
    "magasin_id": "MAG-004",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Balais Atelier",
    "category": "Entretien & Hygiène",
    "unit": "u",
    "location": "Casier Etage",
    "magasin_id": "MAG-004",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Balais salle de classe",
    "category": "Entretien & Hygiène",
    "unit": "u",
    "location": "Casier Etage",
    "magasin_id": "MAG-004",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Brosse à manche (brosse)",
    "category": "Entretien & Hygiène",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-004",
    "min_qty": 1,
    "initial_qty": 7
  },
  {
    "name": "Brosse de bidai",
    "category": "Entretien & Hygiène",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-004",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Gants",
    "category": "Entretien & Hygiène",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-004",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Raclette",
    "category": "Entretien & Hygiène",
    "unit": "Piece",
    "location": "Casier ZZ",
    "magasin_id": "MAG-004",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Raclette à manche",
    "category": "Entretien & Hygiène",
    "unit": "u",
    "location": "Casier Haut",
    "magasin_id": "MAG-004",
    "min_qty": 1,
    "initial_qty": 1
  },
  {
    "name": "Sceaux",
    "category": "Entretien & Hygiène",
    "unit": "u",
    "location": "Casier Etage",
    "magasin_id": "MAG-004",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Serpiere",
    "category": "Entretien & Hygiène",
    "unit": "Piece",
    "location": "Casier ZZ",
    "magasin_id": "MAG-004",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Bande adhésive de carrosserie (25mm de large)",
    "category": "Fixation & Assemblage",
    "unit": "En pièce (Carton (36 pièces))",
    "location": "Casier N2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 60
  },
  {
    "name": "Boulon + ecrou-8m (8X 80 mm)",
    "category": "Fixation & Assemblage",
    "unit": "pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Butoir de porte (de 100)",
    "category": "Fixation & Assemblage",
    "unit": "paire",
    "location": "Casier T4",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 5
  },
  {
    "name": "Charnières meuble argentée (W-02_taille 75)",
    "category": "Fixation & Assemblage",
    "unit": "Pièces",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Charnières meuble d'orées (W-01_taille 75)",
    "category": "Fixation & Assemblage",
    "unit": "Pièces",
    "location": "Casier T6",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 49
  },
  {
    "name": "Cheville  ⌀ 12 (B-04_⌀ 12)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier Q1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 8
  },
  {
    "name": "Cheville  ⌀ 6 (B-01_⌀ 6)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte (100 pces)",
    "location": "Casier U1",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 25
  },
  {
    "name": "Cheville ⌀ 10 (B-03_⌀ 10)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte (50 pces)",
    "location": "Casier R1",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 15
  },
  {
    "name": "Cheville ⌀ 8 (B-02_⌀ 8)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte (100 pces)",
    "location": "Casier S1",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 13
  },
  {
    "name": "Clou (Pointe) de 2 sans tête (Paquet)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Clou 100 (E-08_100)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier I2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 7
  },
  {
    "name": "Clou 25 (E-09_25)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier I1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 4
  },
  {
    "name": "Clou 30 (E-01_30)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier H3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 12
  },
  {
    "name": "Clou 40 (E-02_40)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier H3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 16
  },
  {
    "name": "Clou 50 (E-03_50)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier H2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 8
  },
  {
    "name": "Clou 60 (E-04_60)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier H2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 10
  },
  {
    "name": "Clou 70 (E-05_70)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier I3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 10
  },
  {
    "name": "Clou 90 (E-07_90)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier I2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 9
  },
  {
    "name": "Clou à pression de 15 (15mm)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Clou à Pression de 20 (20 mm)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier H1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Clou à Pression de 25 (25 mm)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier H1",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 11
  },
  {
    "name": "Clou à Pression de 30 (30 mm)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier H1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 5
  },
  {
    "name": "Clou à Pression de 40 (40 mm)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier H1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 6
  },
  {
    "name": "Clou à pression de 50",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier H1",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 16
  },
  {
    "name": "Clou à Pression de 50 (40 mm)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier H1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Clou à pression N°15",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier H1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Clou de 30 (petit paquet)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier I1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Clou de 80 (E-06_80)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier I3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 10
  },
  {
    "name": "Clou Petit 28 mm (E-10_28mm)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier I1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 3
  },
  {
    "name": "Clou sans tête N° 28 / 30 (N° 28 / 30 mm)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Clou toc 30",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Clou toc 50 (50mm)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier K4",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 13
  },
  {
    "name": "Clou toc 60 (60mm)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier K3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 14
  },
  {
    "name": "Clou toc 70 (70mm)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier K2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 14
  },
  {
    "name": "Clou toc 80 (80mm)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier K1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 8
  },
  {
    "name": "Dome de silence",
    "category": "Fixation & Assemblage",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Ecrou ⌀ 10 (F-02_⌀ 10)",
    "category": "Fixation & Assemblage",
    "unit": "Sachet",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Ecrou ⌀ 8 (F-01_⌀ 8)",
    "category": "Fixation & Assemblage",
    "unit": "Sachet",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Equerre",
    "category": "Fixation & Assemblage",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Equerre de 60x60 (60x60)",
    "category": "Fixation & Assemblage",
    "unit": "Piece",
    "location": "Casier BC",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Equerre de fixation (150 x 250mm)",
    "category": "Fixation & Assemblage",
    "unit": "pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Garniture de lit (D-01_métallique)",
    "category": "Fixation & Assemblage",
    "unit": "Jeux de 4",
    "location": "Casier T6",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 132
  },
  {
    "name": "Garniture de lit (Encastré)",
    "category": "Fixation & Assemblage",
    "unit": "Unité",
    "location": "Casier T5",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Loqueteau aimanté (H-01_plastique)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte (40pces) à 9000",
    "location": "Casier D3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 1696
  },
  {
    "name": "Mêche à bois en Allu",
    "category": "Fixation & Assemblage",
    "unit": "Piece",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Paquet embout de visage (Paquet de 10 pieces)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier AB",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 3
  },
  {
    "name": "Patin de meuble",
    "category": "Fixation & Assemblage",
    "unit": "Unité",
    "location": "Casier T5",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 7
  },
  {
    "name": "Paumelle Anuba doré (J-01_taille 65mm)",
    "category": "Fixation & Assemblage",
    "unit": "Pièce",
    "location": "Casier T2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 220
  },
  {
    "name": "Paumelle Anuba doré (J-01_taille 65mm)",
    "category": "Fixation & Assemblage",
    "unit": "Pièce",
    "location": "Casier T2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 220
  },
  {
    "name": "Paumelle invisible  Avec amortisseur (K-01 Avec amortisseur)",
    "category": "Fixation & Assemblage",
    "unit": "Jeux de 2",
    "location": "Casier T1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 4
  },
  {
    "name": "Paumelle invisible Sans amortisseur (K-02 Sans amortisseur)",
    "category": "Fixation & Assemblage",
    "unit": "Jeux de 2",
    "location": "Casier T1",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 17
  },
  {
    "name": "Paumelle invisible Sans amortisseur (K-02 Sans amortisseur)",
    "category": "Fixation & Assemblage",
    "unit": "Jeux de 2",
    "location": "Casier T1",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 17
  },
  {
    "name": "Paumelle pour battants vitrées",
    "category": "Fixation & Assemblage",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Paumelles Universelle",
    "category": "Fixation & Assemblage",
    "unit": "Paire",
    "location": "Casier zz",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 122
  },
  {
    "name": "Pointe de 2 avec tête (Paquet)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Rondele de 10 (Diametre 10)",
    "category": "Fixation & Assemblage",
    "unit": "Sachet",
    "location": "Casier T7",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 200
  },
  {
    "name": "Rondele de 8 (Diametre 8)",
    "category": "Fixation & Assemblage",
    "unit": "Sachet",
    "location": "Casier T7",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 200
  },
  {
    "name": "Rondelle ⌀ 10 (G-02_⌀ 10)",
    "category": "Fixation & Assemblage",
    "unit": "Sachet",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Rondelle ⌀ 8 (G-01_⌀ 8)",
    "category": "Fixation & Assemblage",
    "unit": "Sachet",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Roulette des rail des battants (Coulissant)",
    "category": "Fixation & Assemblage",
    "unit": "Sachet",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Support tringle placard (D=15mm)",
    "category": "Fixation & Assemblage",
    "unit": "pièce",
    "location": "Casier T9",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 522
  },
  {
    "name": "Taquet à douille (métallique)",
    "category": "Fixation & Assemblage",
    "unit": "pièce",
    "location": "Casier M4",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 100
  },
  {
    "name": "Taquet à douille (en plastique)",
    "category": "Fixation & Assemblage",
    "unit": "pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 200
  },
  {
    "name": "Tête de Fraise (Paquet de 12 Pces)",
    "category": "Fixation & Assemblage",
    "unit": "Paquet",
    "location": "Casier D3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Verroux argentés en applique (taille 100mm)",
    "category": "Fixation & Assemblage",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Verroux argentés en applique (Taille 150mm)",
    "category": "Fixation & Assemblage",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Verroux cuivrés en applique (Taille 150mm)",
    "category": "Fixation & Assemblage",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Verroux dorés en applique (taille 75mm)",
    "category": "Fixation & Assemblage",
    "unit": "Pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Verroux encastrée 100 (taille 100)",
    "category": "Fixation & Assemblage",
    "unit": "pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Verroux encastrée 160 (taille 160)",
    "category": "Fixation & Assemblage",
    "unit": "pièce",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Verroux encastrée 200 (taille 200)",
    "category": "Fixation & Assemblage",
    "unit": "pièce",
    "location": "Casier N4",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 196
  },
  {
    "name": "Vis  3x20 (A03-2_3x20)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier O3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 9
  },
  {
    "name": "Vis  4x16 (A04-1_4x16)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier O4",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 22
  },
  {
    "name": "Vis  4x20 (A04-11_4x20)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier O3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 20
  },
  {
    "name": "Vis  4x25 (A04-3_4x25)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier P3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 18
  },
  {
    "name": "Vis  4x35 (A04-5_4x35)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier P3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 19
  },
  {
    "name": "Vis  4x40 (A04-6_4x40)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier P2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 19
  },
  {
    "name": "Vis  5x30 (A05-6_5x30)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier Q4",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 15
  },
  {
    "name": "Vis  5x50 (A05-7_5x50)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier Q2",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 9
  },
  {
    "name": "Vis  5x60 (A05-8_5x60)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier R4",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 15
  },
  {
    "name": "Vis  6x50 (A06-7_6x50)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier S2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 22
  },
  {
    "name": "Vis  6x60 (A06-8_6x60)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier U4",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 25
  },
  {
    "name": "Vis 3x15 (3x15)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vis 3x16 (A03-1_3x16)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier O2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 19
  },
  {
    "name": "Vis 3x25",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier O4",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 15
  },
  {
    "name": "Vis 3x30",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier O2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 11
  },
  {
    "name": "Vis 4x16",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier O4",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vis 4x30 (A04-4_4x30)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier P4",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 10
  },
  {
    "name": "Vis 4x50 (A04-7_4x50)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier P3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 20
  },
  {
    "name": "Vis 4x60 (A04-8_4x60)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier P2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 24
  },
  {
    "name": "Vis 5x40 (A05-9_5x40)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier Q3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 25
  },
  {
    "name": "Vis 5x70 (A05-9_5x70)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier R3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 15
  },
  {
    "name": "Vis 5x80 (A05-10_5x80)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier R2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 30
  },
  {
    "name": "Vis 6x30 (A06-4_6x30)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier S4",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 19
  },
  {
    "name": "Vis 6x40 (A06-6_6x40)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier S3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 11
  },
  {
    "name": "Vis 6x70 (A06-9_6x70)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier U3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 20
  },
  {
    "name": "Vis 6x80 (A06-10_6x80)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier U2",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 21
  },
  {
    "name": "Vis d'assemblage",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vis de rappel (C-01_Métallique)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vis de rappel (C-02_Plastique)",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier T5",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 777
  },
  {
    "name": "Vis de rappel pour panneau de particule",
    "category": "Fixation & Assemblage",
    "unit": "Boîte",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 312
  },
  {
    "name": "Dégrippant (tube)",
    "category": "Garnissage",
    "unit": "Unité",
    "location": "Casier L3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 9
  },
  {
    "name": "Graisse (en pot)",
    "category": "Garnissage",
    "unit": "1kg",
    "location": "Casier M1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 2
  },
  {
    "name": "Huille D40 (en pot)",
    "category": "Garnissage",
    "unit": "pot",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Crayon Menuisier",
    "category": "Outillage & Consommables",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Embou de Tournevis",
    "category": "Outillage & Consommables",
    "unit": "Unité",
    "location": "Casier AB",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Jeux de scie cloche (boite de 13)",
    "category": "Outillage & Consommables",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Rappe (Paquet de 3) (Paquet de 3 manche orange)",
    "category": "Outillage & Consommables",
    "unit": "Paquet",
    "location": "Casier EF",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Rappe (Paquet de 3)",
    "category": "Outillage & Consommables",
    "unit": "Unité",
    "location": "Casier H1",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Rappe sémi rond (Sémi rond)",
    "category": "Outillage & Consommables",
    "unit": "Unité",
    "location": "Casier EF",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Support étagére avec troux",
    "category": "Outillage & Consommables",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Après-mastic Cellulo (1Kg)",
    "category": "Produits de Finition",
    "unit": "pot",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 1
  },
  {
    "name": "Cire (aérosole)",
    "category": "Produits de Finition",
    "unit": "tube",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Décapant (1Kg)",
    "category": "Produits de Finition",
    "unit": "pot",
    "location": "Casier O1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Dilluant  Abro (20 Litre)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Dilluant  Marque Universal 20L",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Dilluant 20 l (2O Litre)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Dilluant White Spirit 5 litre",
    "category": "Produits de Finition",
    "unit": "Bidon",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Diluant acétone (1l)",
    "category": "Produits de Finition",
    "unit": "litre",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Diluant Cellulosique (Q-01_200 litres)",
    "category": "Produits de Finition",
    "unit": "Fût",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Diluant cellulosique (Q-04_ en 25 litres)",
    "category": "Produits de Finition",
    "unit": "bidon (25L)",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Diluant Cellulosique (505) (Q-03_25 litres)",
    "category": "Produits de Finition",
    "unit": "pot de",
    "location": "Casier Z1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Diluant White Spirit 4 L (Q-02_5 litres)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Diluant white Spirit 5 L",
    "category": "Produits de Finition",
    "unit": "Unité",
    "location": "Casier U6",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 1
  },
  {
    "name": "Doucine",
    "category": "Produits de Finition",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Durcisseur synthétique (auto refinish) (en Kg)",
    "category": "Produits de Finition",
    "unit": "en pot",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Durcisseur Weitemei Bte de 1 L",
    "category": "Produits de Finition",
    "unit": "Unité",
    "location": "Casier U1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Fond dur (celulo en 4Kg)",
    "category": "Produits de Finition",
    "unit": "pot",
    "location": "Casier Z1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Fond dur 20l (2O Litre)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Fond dur Cellulosique (P-01_25 litres)",
    "category": "Produits de Finition",
    "unit": "Bidon",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Fond dur Cellulosique (P-02_200 litres)",
    "category": "Produits de Finition",
    "unit": "Fût",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Fond dur marque Master l 20L (20 LITRE)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Fond dur marque National 20L (20 LITRE)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Fond dur Marque Smalto (20LITRE)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Fond dur marque Universal 20L (20 LITRE)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Fond dur Nationlal 20 L (2O Litre)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Lacque blanche super shine bte de 1 L",
    "category": "Produits de Finition",
    "unit": "Unité",
    "location": "Casier U2",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 1
  },
  {
    "name": "Mastic cellulosique (1Kg)",
    "category": "Produits de Finition",
    "unit": "pot",
    "location": "Casier N1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 4
  },
  {
    "name": "Mastique synthetique (synto)",
    "category": "Produits de Finition",
    "unit": "pot de 3kg",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Papier abrasif (N°1000)",
    "category": "Produits de Finition",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Peinture blanche",
    "category": "Produits de Finition",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Peinture Grise",
    "category": "Produits de Finition",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Peinture Jaune",
    "category": "Produits de Finition",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Peinture laque (1Kg)",
    "category": "Produits de Finition",
    "unit": "pot",
    "location": "Casier O1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 2
  },
  {
    "name": "Peinture professionnelle seigneurie 2,5 L",
    "category": "Produits de Finition",
    "unit": "Unité",
    "location": "Casier U5",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Peinture professionnelle smalto blanc",
    "category": "Produits de Finition",
    "unit": "Unité",
    "location": "Casier U4",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 1
  },
  {
    "name": "Peinture rouge",
    "category": "Produits de Finition",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Popote polish (tube de 1litre)",
    "category": "Produits de Finition",
    "unit": "Litre",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Syntopher",
    "category": "Produits de Finition",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Teinte / colorant (S-01_Jaune vallauris)",
    "category": "Produits de Finition",
    "unit": "Tube",
    "location": "Casier P1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 2
  },
  {
    "name": "Teinte / colorant (S-02_Marron Nevada)",
    "category": "Produits de Finition",
    "unit": "Tube",
    "location": "Casier P1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 3
  },
  {
    "name": "Teinte / colorant (S-03_Noir Zola)",
    "category": "Produits de Finition",
    "unit": "Tube",
    "location": "Casier P1",
    "magasin_id": "MAG-015",
    "min_qty": 5,
    "initial_qty": 11
  },
  {
    "name": "Teinte / colorant (S-04_Rouge Castille)",
    "category": "Produits de Finition",
    "unit": "Tube",
    "location": "Casier P1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 1
  },
  {
    "name": "Teinte / colorant (S-05_Vert Irlande)",
    "category": "Produits de Finition",
    "unit": "Tube",
    "location": "Casier P1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 1
  },
  {
    "name": "Teinte / colorant (S-06_Bleu caraibes)",
    "category": "Produits de Finition",
    "unit": "Tube",
    "location": "Casier P1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 5
  },
  {
    "name": "Teinte / colorant (Acajoul foncé)",
    "category": "Produits de Finition",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Teinte cellulosique (R-02_Chêne en litre)",
    "category": "Produits de Finition",
    "unit": "Bidon en 5 litres",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Teinte cellulosique (R-03_Merisier litre)",
    "category": "Produits de Finition",
    "unit": "Bidon en 5 litres",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Teinte cellulosique (R-04_Pin en litre)",
    "category": "Produits de Finition",
    "unit": "Bidon en 5 litres",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Teinte cellulosique Acajou (R-01_Acajou en litrre)",
    "category": "Produits de Finition",
    "unit": "Bidonen 5 litres",
    "location": "Casier G1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Teinte cellulosique Ebene (R-01_Ebéne en litrre)",
    "category": "Produits de Finition",
    "unit": "Bidonen 5 litres",
    "location": "Casier G1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Teinte Cellulosique Jaune",
    "category": "Produits de Finition",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Teinte Cellulosique Noire",
    "category": "Produits de Finition",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Teinte cellulosique Teck (R-01_Teck en litrre)",
    "category": "Produits de Finition",
    "unit": "Bidonen 5 litres",
    "location": "Casier G1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Teinte Ebéne 1 l",
    "category": "Produits de Finition",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Teinte merisié",
    "category": "Produits de Finition",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Teinte Teck 1 l",
    "category": "Produits de Finition",
    "unit": "Unité",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis (brillant en 20 litres)",
    "category": "Produits de Finition",
    "unit": "pot (20L)",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis auto (synthétique en pot)",
    "category": "Produits de Finition",
    "unit": "pot de 1kg",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis auto Weitemei bte de 1 L",
    "category": "Produits de Finition",
    "unit": "Unité",
    "location": "Casier U3",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 9
  },
  {
    "name": "Vernis Brillant 5L (5 Litre)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis Brillant smalto 20 l (2O Litre)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis cellulosique (O-01_Brillant en 200 litres)",
    "category": "Produits de Finition",
    "unit": "Fût (200L)",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis cellulosique (O-03_Mat en 1 litre)",
    "category": "Produits de Finition",
    "unit": "Pot (1L)",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis cellulosique (O-04_Mat en 5 litres)",
    "category": "Produits de Finition",
    "unit": "Pot (5L)",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis cellulosique (O-05_brillant (25l))",
    "category": "Produits de Finition",
    "unit": "pot (25L)",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis cellulosique 20 l (2O Litre)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis Fond dur Nationlal (20 litre)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis Marin (O-02_ en 5 litres)",
    "category": "Produits de Finition",
    "unit": "pot (5L)",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis marque Smalto 20L (20 LITRE)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis Marque Universal 20L (20LITRE)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis marrin (Brillant)",
    "category": "Produits de Finition",
    "unit": "pot de 25l",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis Mat 20 L (2O Litre)",
    "category": "Produits de Finition",
    "unit": "Saut",
    "location": "Magasin Central",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vernis polyester (vitrificateur PU)",
    "category": "Produits de Finition",
    "unit": "pot",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Vitri bois (1kg)",
    "category": "Produits de Finition",
    "unit": "Unité",
    "location": "Casier O1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Cache-nez en plastic (X-02_pour vernissage)",
    "category": "Protection Individuelle",
    "unit": "pièces",
    "location": "Casier E3",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 1
  },
  {
    "name": "Cache-nez En tissu (X-01_anti_poussières)",
    "category": "Protection Individuelle",
    "unit": "En boite de 20 pièces",
    "location": "Casier E3",
    "magasin_id": "MAG-019",
    "min_qty": 5,
    "initial_qty": 19
  },
  {
    "name": "Gant rouge (Paire)",
    "category": "Protection Individuelle",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Lunette de sécurité Emtop (en plastique)",
    "category": "Protection Individuelle",
    "unit": "Unité",
    "location": "Casier EF",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 2,
    "brand": "EMTOP"
  },
  {
    "name": "Polyamide (plastique) (rouleau de 100m)",
    "category": "Protection Individuelle",
    "unit": "m",
    "location": "Casier ZZ",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Rouleaux pour vernissage",
    "category": "Protection Individuelle",
    "unit": "u",
    "location": "Magasin Central",
    "magasin_id": "MAG-019",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Gazoile (bidon de 25 L)",
    "category": "Solvants, Diluvants & Carburants",
    "unit": "Bidon",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Produit de protection (T-01_Xylophène en 6 litres)",
    "category": "Traitement & Protection du Bois",
    "unit": "Pot (6L)",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Produit de protection (T-02_Imprébois en 20 litres)",
    "category": "Traitement & Protection du Bois",
    "unit": "Bidon (20L)",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 2
  },
  {
    "name": "Produit de protection (T-03_Pyriforce en 1 litre)",
    "category": "Traitement & Protection du Bois",
    "unit": "Pot (1L)",
    "location": "Casier L4",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Produit de protection active (LX515  5l)",
    "category": "Traitement & Protection du Bois",
    "unit": "Unité",
    "location": "Casier I1",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Produit de protection Xylototal (Xylophene espert 5l)",
    "category": "Traitement & Protection du Bois",
    "unit": "Unité",
    "location": "Casier ZZ",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Protection bois bidon de 20 L",
    "category": "Traitement & Protection du Bois",
    "unit": "Unité",
    "location": "Casier U6",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  },
  {
    "name": "Protection bois bidon de 5 L",
    "category": "Traitement & Protection du Bois",
    "unit": "Unité",
    "location": "Casier U6",
    "magasin_id": "MAG-015",
    "min_qty": 1,
    "initial_qty": 0
  }
];

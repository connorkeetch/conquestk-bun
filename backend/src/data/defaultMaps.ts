// Default test maps for development and testing
export const testWorldMap = {
  name: "Test World Map",
  description: "A simple 6-territory map for testing game functionality",
  imageUrl: "/maps/simple-world.png", // We'll need to add an image
  imageWidth: 800,
  imageHeight: 600,
  isPublic: true,
  
  territories: [
    {
      name: "North America",
      boundaryCoords: [
        {x: 100, y: 150}, {x: 250, y: 150}, {x: 250, y: 300}, {x: 100, y: 300}
      ],
      armyPosition: {x: 175, y: 225},
      continentId: "americas",
      color: "#dc2626"
    },
    {
      name: "South America", 
      boundaryCoords: [
        {x: 150, y: 350}, {x: 250, y: 350}, {x: 250, y: 500}, {x: 150, y: 500}
      ],
      armyPosition: {x: 200, y: 425},
      continentId: "americas",
      color: "#dc2626"
    },
    {
      name: "Europe",
      boundaryCoords: [
        {x: 350, y: 150}, {x: 450, y: 150}, {x: 450, y: 250}, {x: 350, y: 250}
      ],
      armyPosition: {x: 400, y: 200},
      continentId: "eurasia",
      color: "#2563eb"
    },
    {
      name: "Africa",
      boundaryCoords: [
        {x: 350, y: 300}, {x: 450, y: 300}, {x: 450, y: 450}, {x: 350, y: 450}
      ],
      armyPosition: {x: 400, y: 375},
      continentId: "africa",
      color: "#16a34a"
    },
    {
      name: "Asia",
      boundaryCoords: [
        {x: 500, y: 150}, {x: 650, y: 150}, {x: 650, y: 300}, {x: 500, y: 300}
      ],
      armyPosition: {x: 575, y: 225},
      continentId: "eurasia",
      color: "#2563eb"
    },
    {
      name: "Australia",
      boundaryCoords: [
        {x: 550, y: 400}, {x: 700, y: 400}, {x: 700, y: 500}, {x: 550, y: 500}
      ],
      armyPosition: {x: 625, y: 450},
      continentId: "oceania",
      color: "#7c3aed"
    }
  ],
  
  continents: [
    {
      name: "Americas",
      color: "#dc2626",
      bonusArmies: 5,
      territories: ["North America", "South America"]
    },
    {
      name: "Eurasia",
      color: "#2563eb", 
      bonusArmies: 7,
      territories: ["Europe", "Asia"]
    },
    {
      name: "Africa",
      color: "#16a34a",
      bonusArmies: 3,
      territories: ["Africa"]
    },
    {
      name: "Oceania",
      color: "#7c3aed",
      bonusArmies: 2,
      territories: ["Australia"]
    }
  ],
  
  adjacencies: [
    // Americas connections
    {from: "North America", to: "South America"},
    {from: "North America", to: "Europe"},
    
    // Europe connections
    {from: "Europe", to: "Africa"},
    {from: "Europe", to: "Asia"},
    
    // Africa connections
    {from: "Africa", to: "South America"}, // Cross-Atlantic
    {from: "Africa", to: "Asia"},
    
    // Asia-Australia connection
    {from: "Asia", to: "Australia"}
  ]
};

// Classic Risk map data (42 territories)
export const classicRiskMap = {
  name: "Classic Risk",
  description: "The original Risk board game map with 42 territories",
  imageUrl: "/maps/classic-risk.svg",
  imageWidth: 1200,
  imageHeight: 800,
  isPublic: true,
  
  // This would need all 42 territories defined...
  // For now, using simplified version above
};
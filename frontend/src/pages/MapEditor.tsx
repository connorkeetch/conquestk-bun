import { useState } from 'react'

export default function MapEditor() {
  const [selectedTool, setSelectedTool] = useState<'select' | 'territory' | 'connection'>('select')

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Map Editor</h1>
        <div className="space-x-2">
          <button className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded">
            Save Map
          </button>
          <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">
            Load Map
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Canvas */}
        <div className="lg:col-span-3">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Map Canvas</h2>
            <div className="bg-gray-700 rounded h-96 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <p className="text-lg">Map editing canvas</p>
                <p className="text-sm">Click and drag to create territories</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tools Panel */}
        <div className="space-y-4">
          {/* Tools */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Tools</h3>
            <div className="space-y-2">
              <button
                onClick={() => setSelectedTool('select')}
                className={`w-full px-3 py-2 rounded text-sm ${
                  selectedTool === 'select'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                Select Tool
              </button>
              <button
                onClick={() => setSelectedTool('territory')}
                className={`w-full px-3 py-2 rounded text-sm ${
                  selectedTool === 'territory'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                Territory Tool
              </button>
              <button
                onClick={() => setSelectedTool('connection')}
                className={`w-full px-3 py-2 rounded text-sm ${
                  selectedTool === 'connection'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                Connection Tool
              </button>
            </div>
          </div>

          {/* Properties */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Properties</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Territory Name</label>
                <input
                  type="text"
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                  placeholder="Enter name..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Continent</label>
                <select className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm">
                  <option value="">Select continent...</option>
                  <option value="north-america">North America</option>
                  <option value="south-america">South America</option>
                  <option value="europe">Europe</option>
                  <option value="africa">Africa</option>
                  <option value="asia">Asia</option>
                  <option value="australia">Australia</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Color</label>
                <input
                  type="color"
                  className="w-full h-8 bg-gray-700 border border-gray-600 rounded"
                  defaultValue="#3B82F6"
                />
              </div>
            </div>
          </div>

          {/* Territories List */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Territories</h3>
            <div className="max-h-48 overflow-y-auto space-y-1">
              <div className="text-sm text-gray-400">No territories created yet</div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Actions</h3>
            <div className="space-y-2">
              <button className="w-full bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm">
                Clear Map
              </button>
              <button className="w-full bg-yellow-600 hover:bg-yellow-700 px-3 py-2 rounded text-sm">
                Validate Map
              </button>
              <button className="w-full bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded text-sm">
                Export JSON
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
import React from 'react'

function TestApp() {
  console.log('[TEST-APP] React version:', React.version)
  console.log('[TEST-APP] React object:', React)
  console.log('[TEST-APP] useMemo available:', typeof React.useMemo)
  
  return (
    <div style={{ padding: '20px', color: 'white', backgroundColor: '#333' }}>
      <h1>Test App - React is Working!</h1>
      <p>React version: {React.version}</p>
      <p>This is a simple test without Redux Provider</p>
    </div>
  )
}

export default TestApp
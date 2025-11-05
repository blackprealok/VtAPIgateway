"use client";

import { useState } from 'react';

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const handleSendMessage = async () => {
    if (!apiKey || !message) {
      setError('Please enter both API key and message');
      return;
    }
    
    setLoading(true);
    setResponse('');
    setError('');
    
    try {
      const res = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: message }],
          temperature: 0.7,
          stream: false
        })
      });
      
      if (!res.ok) {
        const error = await res.json();
        setError(`Error: ${error.message || res.statusText}`);
        return;
      }
      
      const data = await res.json();
      setResponse(data.choices[0].message.content);
      
    } catch (error) {
      setError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div style={{ padding: '40px', maxWidth: '900px', margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1>Vercel Vertex AI Gateway</h1>
      <p>OpenAI-compatible Gemini proxy gateway</p>
      
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontWeight: 'bold' }}>Private API Key:</label>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={{ width: '100%', padding: '10px' }} />
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontWeight: 'bold' }}>Message:</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} style={{ width: '100%', padding: '10px', minHeight: '120px' }} />
      </div>
      
      <button onClick={handleSendMessage} disabled={loading} style={{ padding: '12px 30px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
        {loading ? 'Sending...' : 'Send Message'}
      </button>
      
      {error && <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '4px' }}>{error}</div>}
      
      {response && <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}><h3>Response:</h3><p>{response}</p></div>}
    </div>
  );
}
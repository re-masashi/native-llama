import React, {useState, useEffect, useRef, useCallback} from 'react';
import { FaPaperPlane } from 'react-icons/fa';
import { Link, Route, Switch, useLocation } from "wouter";
import Select from 'react-select'
import Markdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { invoke } from '@tauri-apps/api/core';
import './hljs.css'

import {useChatStore} from './store'
import BackgroundGradientAnimation from './components/BackgroundGradientAnimation'
import './App.css';

const Chat = ({ params }) => {
  const { id } = params;
  const { chats, sendMessage, tokenSpeed } = useChatStore();
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const formRef = useRef(null);

  // Memoize chat finding to prevent unnecessary recalculations
  const chat = chats.find(c => c.id === id);

  // Optimized input handler
  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
  }, []);

  // Optimized message submission
  const handleSendMessage = useCallback(async (e) => {
    e.preventDefault();
    if (!input.trim() || !chat || isSending) return;
    
    setIsSending(true);
    try {
      await sendMessage(chat.id, input.trim());
      setInput('');
      // Focus input after sending
      formRef.current?.querySelector('input')?.focus();
    } finally {
      setIsSending(false);
    }
    // messagesEndRef.current.scrollIntoView({behavior: "smooth", block: "end"})
  }, [input, chat, isSending, sendMessage]);

  if (!chat) return (
    <div className="w-full h-full flex items-center justify-center text-white">
      Chat not found
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full p-4">
      <div className="flex flex-col flex-1 overflow-y-auto bg-zinc-900/40 rounded-xl">
        <div className="top-0 relative h-10 flex flex-row items-center justify-center border-white/30 border-b-2 w-full px-4 text-gray-200 text-xl font-bold backdrop-blur-2xl">
          <div className="left-0 absolute flex items-center">
            <span className="text-xs px-4 h-full bg-zinc-700/40">
              Token Speed: <b>{tokenSpeed || 0}/s</b>
            </span>            
          </div>
          {chat.title}
          <div className="right-0 absolute flex items-center">
            <span className="text-xs px-4 h-full bg-zinc-700/40 py-2">
              {chat.model}
            </span>            
          </div>
        </div>
        
        <div className="flex flex-col overflow-y-scroll h-full px-2">
          {chat.messages.map((msg, index) => (
            <MemoizedMessage 
              key={`${msg.timestamp}-${index}`}
              msg={msg}
              isStreaming={msg.isStreaming}
            />
          ))}
          <div className="relative" ref={messagesEndRef} />
        </div>
      </div>

      <form 
        ref={formRef}
        onSubmit={handleSendMessage}
        className="flex flex-row my-4 rounded-lg bg-gray-900/70 backdrop-blur-2xl"
      >
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder={isSending ? "Wait..." : "Type your message..."}
          disabled={isSending}
          className="flex-1 p-4 transition duration-300 outline-none text-white bg-transparent disabled:opacity-50"
          autoFocus
        />
        <button 
          type="submit" 
          disabled={isSending}
          className="ml-2 px-5 rounded-lg transition duration-200 disabled:opacity-50"
        >
          <FaPaperPlane className="text-white text-xl" />
        </button>
      </form>
    </div>
  );
};

// Memoized message component to prevent unnecessary re-renders
const MemoizedMessage = React.memo(({ msg, isStreaming }) => {
  return (
    <div className={`my-2 p-3 rounded-xl backdrop-blur-2xl ${
      msg.sender === 'user' 
        ? 'bg-blue-300/20 ml-auto text-white self-end' 
        : 'bg-gray-700/40 text-white self-start'
    } ${isStreaming ? 'animate-pulse' : ''}`}
    >
      {msg.sender === 'ai' && msg.text.startsWith('Error: ') ? (
        <div className="text-red-300">
          ⚠️ {msg.text}
        </div>
      ) : (
        <Markdown 
          rehypePlugins={[rehypeHighlight]}
        >
          {msg.text}
        </Markdown>
      )}
      {isStreaming && <span className="ml-2">...</span>}
    </div>
  );
});

const App = () => {
  const { chats, setCurrentChat, deleteChat } = useChatStore();
  return (
    // <div className="bg-black h-screen flex flex-row bg-gradient-to-br from-red-400/60 to-blue-900/60">
    <BackgroundGradientAnimation className="h-screen w-screen overflow-hidden">
      <div className="absolute w-screen h-screen z-50 inset-0 flex flex-row">
        <div className="w-[20vw] transition-all bg-zinc-900/70 backdrop-blur-2xl my-2 rounded-r-3xl px-4 flex flex-col pb-5">
          <div className="w-4/5 mb-4 pt-10">
            <h2 className="text-3xl font-bold text-white">Menu</h2>
          </div>
          
          <div className="w-4/5 mb-2 ">
            <h2 className="text-lg font-bold text-gray-200">Chats</h2>
          </div>
          
          <div className="flex flex-col space-y-2 h-1/2 relative overflow-hidden overflow-y-scroll">
          {chats.map(chat => (
             <div
               key={chat.id}
               className="group flex items-center justify-between hover:bg-zinc-700/50 rounded transition duration-200"
             >
               <Link 
                 href={`/chat/${chat.id}`}
                 onClick={() => setCurrentChat(chat.id)}
                 className="px-4 py-2 flex-1 text-white"
               >
                 {chat.title}
               </Link>
               <button
                 onClick={(e) => {
                   e.stopPropagation();
                   deleteChat(chat.id);
                 }}
                 className="invisible group-hover:visible px-3 text-red-400 hover:text-red-300 transition-colors"
               >
                 ×
               </button>
             </div>
           ))}
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col space-y-1 mt-auto">
            <Link href="/" className="px-4 py-2 flex items-center text-white hover:bg-zinc-700/60 rounded transition duration-200">
              Home
            </Link>
            <Link href="#" className="px-4 py-2 flex items-center text-white hover:bg-zinc-700/60 rounded transition duration-200">
              History
            </Link>
            <Link href="/settings" className="px-4 py-2 flex items-center text-white hover:bg-zinc-700/60 rounded transition duration-200">
              Settings
            </Link>
          </nav>
        </div>
        <Switch>
          <Route path="/" component={Home} />

          <Route path="/chat/:id">
            {(params) => <Chat params={params}/>}
          </Route>

          <Route path="settings">
            <Settings/>
          </Route>

          <Route>404: No such page!</Route>
        </Switch>
      </div>
    </BackgroundGradientAnimation>
    // </div>
  );
};

const Home = () => {
  const [input, setInput] = useState('');
  const { createChat, availableModels, loadingModels, fetchModels } = useChatStore();
  const [selectedModel, setSelectedModel] = useState('');
  const [_, navigate] = useLocation();

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || !selectedModel) return;
    
    const chatId = createChat(input.trim(), selectedModel);
    navigate(`/chat/${chatId}`);
    setInput('');
  };

  return (
    <div className="w-full flex flex-col h-full items-center justify-center">
      <div className="bg-zinc-900/40 backdrop-blur-2xl bg-opacity-10 backdrop-blur-lg rounded-xl shadow-lg p-8 max-w-lg w-full">
        <h1 className="text-4xl font-bold text-white mb-4 text-center">Native Llama</h1>
        
        <div className="mb-4">
          <label className="text-white block mb-2">Select Model:</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full p-2 rounded-lg bg-gray-400/30 text-white"
            disabled={loadingModels}
          >
            <option value="">{loadingModels ? 'Loading models...' : 'Select a model'}</option>
            {availableModels.map((model) => (
              <option key={model.name} value={model.name}>
                {model.name} ({model.details?.size ? `${(model.details.size / 1e9).toFixed(1)}GB` : ''})
              </option>
            ))}
          </select>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            className="w-full p-4 outline-none rounded-lg bg-gray-400/30 focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-gray-300 text-gray-200 transition duration-500"
          />
          <button 
            type="submit" 
            className="mt-4 w-full py-2 rounded-lg bg-blue-500/60 hover:bg-blue-600/60 transition text-white font-semibold transition duration-200"
            disabled={!selectedModel}
          >
            Start Chat
          </button>
        </form>

        <footer className="mt-8 text-white text-sm">
          <p>© 2025 re-masashi</p>
        </footer>
      </div>
    </div>
  );
};

const Settings = () => {
  const [activeTab, setActiveTab] = useState('ollama');
  const [isOllamaRunning, setIsOllamaRunning] = useState(false);
  const [models, setModels] = useState([]);
  const [apiKey, setApiKey] = useState(localStorage.getItem('OLLAMA_API_KEY') || '');

  // Check if Ollama server is running
  const checkOllamaStatus = async () => {
    try {
      const response = await fetch('http://localhost:11434/api/ps');
      setIsOllamaRunning(response.ok);
    } catch (error) {
      setIsOllamaRunning(false);
    }
  };

  // Fetch available models
  const fetchModels = async () => {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (response.ok) {
        const data = await response.json();
        setModels(data.models || []);
      } else {
        setModels([]);
      }
    } catch (error) {
      setModels([]);
    }
  };

  // Start Ollama server (Note: This typically requires manual initiation)
  const startOllama = () => {
    invoke('start_ollama', {}).then(r=>alert(r))
  };

  // Stop Ollama server (Note: This typically requires manual termination)
  const stopOllama = () => {
    alert('Please stop the Ollama server manually.');
  };

  // Save API key to local storage
  const saveApiKey = () => {
    localStorage.setItem('OLLAMA_API_KEY', apiKey);
    alert('API key saved successfully.');
  };

  useEffect(() => {
    checkOllamaStatus();
    fetchModels();
  }, []);

  return (
    <div className="w-full py-3 flex flex-col items-center justify-center">
      <div className="w-full h-full relative bg-zinc-900/40 backdrop-blur-2xl bg-opacity-10 backdrop-blur-lg rounded-xl shadow-lg p-8 max-w-lg">
        <h1 className="text-4xl font-bold text-white mb-4 text-center">Settings</h1>
        <hr className="border border-white/50 mb-6" />

        {/* Tab Navigation */}
        <div className="flex justify-center mb-6 bg-zinc-700/40 rounded-lg">
          {['General', 'Ollama', 'Config', 'Performance'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab.toLowerCase())}
              className={`mx-2 px-4 py-2 rounded-md outline-none transition duration-200 ${
                activeTab === tab.toLowerCase()
                  ? 'bg-white text-black'
                  : ' text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'general' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-2">General Settings</h2>
              {/* Add general settings here */}
              <p className="text-white">General settings content goes here.</p>
            </div>
          )}

          {activeTab === 'ollama' && (
            <div>
              {/* Ollama Server Status */}
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white mb-2">Ollama Server Status</h2>
                <p className={`text-lg ${isOllamaRunning ? 'text-green-200' : 'text-red-300'}`}>
                  {isOllamaRunning ? 'Running' : 'Not Running'}
                </p>
              </div>

              {/* Start/Stop Ollama Server */}
              <div className="mb-4 flex space-x-4">
                <button
                  onClick={startOllama}
                  className="bg-green-500/70 hover:bg-green-500/80 transition duration-300 text-white font-bold py-2 px-4 rounded"
                >
                  Start Ollama
                </button>
                <button
                  onClick={stopOllama}
                  className="bg-red-500/70 hover:bg-red-500/80 transition duration-300 text-white font-bold py-2 px-4 rounded"
                >
                  Stop Ollama
                </button>
              </div>

              {/* List Available Models */}
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white mb-2">Available Models</h2>
                <ul className="flex flex-col gap-3 h-48 overflow-y-scroll list-inside text-white">
                  {models.length > 0 ? (
                    models.map((model, index) => (
                      <li key={index}>- {model.name}</li>
                    ))
                  ) : (
                    <div>No models available</div>
                  )}
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Configuration</h2>
              <div className="mb-4">
                <label className="block text-white mb-2">API Key:</label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="API KEY"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 outline-none text-white"
                />
                <button
                  onClick={saveApiKey}
                  className="mt-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
                >
                  Save API Key
                </button>
              </div>
            </div>
          )}

          {activeTab === 'performance' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Performance Metrics</h2>
              {/* Add performance metrics here */}
              <p className="text-white">Performance metrics content goes here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

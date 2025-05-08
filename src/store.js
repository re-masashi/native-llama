import { create } from "zustand";
import { persist } from "zustand/middleware";
import { debounce } from 'lodash-es';
import {v4 as uuidv4} from 'uuid';

export const useChatStore = create(
  persist(
    (set, get) => ({
      chats: [],
      currentChatId: null,
      availableModels: [],
      loadingModels: false,
      apiError: null,
      tokenSpeed: 0,

      // Fetch available models from Ollama
      fetchModels: async () => {
        set({ loadingModels: true, apiError: null });
        try {
          const response = await fetch("http://localhost:11434/api/tags");
          if (!response.ok) throw new Error("Failed to fetch models");
          const data = await response.json();
          set({ availableModels: data.models });
        } catch (error) {
          set({ apiError: error.message });
        } finally {
          set({ loadingModels: false });
        }
      },

      // Create new chat with selected model
      createChat: (title, model) => {
        if (!model) throw new Error("No model selected");

        const newChat = {
          id: uuidv4(), //Date.now().toString(),
          title: title || "New Chat",
          model,
          messages: [],
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          chats: [newChat, ...state.chats],
          currentChatId: newChat.id,
        }));

        return newChat.id;
      },

      // Send message to Ollama API
      sendMessage: async (chatId, messageText) => {
        const updateSpeed = debounce((speed) => {
          set({ tokenSpeed: speed });
        }, 200);

        const chat = get().chats.find((c) => c.id === chatId);
        if (!chat) throw new Error("Chat not found");

        // Add user message
        const userMessage = {
          text: messageText,
          sender: "user",
          timestamp: uuidv4(), // new Date().toISOString(),
        };

        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: [...chat.messages, userMessage],
                }
              : chat,
          ),
        }));

        // Add temporary AI message
        const aiMessage = {
          text: "",
          sender: "ai",
          timestamp: uuidv4(), // new Date().toISOString(),
          isStreaming: true,
        };

        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: [...chat.messages, aiMessage],
                }
              : chat,
          ),
        }));

        // Stream response from Ollama
        try {
          const response = await fetch("http://localhost:11434/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: chat.model,
              messages: [
                ...chat.messages
                  .filter(m => m.timestamp !== userMessage.timestamp) // Exclude the just-added user message
                  .map((m) => ({
                    role: m.sender === "user" ? "user" : "assistant",
                    content: m.text,
                  })),
                { role: "user", content: messageText }, // This is the only place the new message should appear
              ],
              stream: true,
            }),
          });

            if (!response.ok) throw new Error("API request failed");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let done = false;
            let aiText = "";

            let tokenCount = 0;
            let startTime = Date.now();
            let lastUpdateTime = startTime;
            let tokensPerSecond = 0;

            while (!done) {
              const { value, done: streamDone } = await reader.read();
              done = streamDone;

              if (value) {
                buffer += decoder.decode(value, { stream: true });

                // Process complete JSON objects in the buffer
                let boundary;
                while ((boundary = buffer.indexOf('\n')) >= 0) {
                  const line = buffer.slice(0, boundary);
                  buffer = buffer.slice(boundary + 1);
                  
                  if (!line.trim()) continue;
                  
                  try {
                    const parsed = JSON.parse(line);
                    if (parsed.message?.content) {
                      aiText += parsed.message.content;
                      tokenCount += parsed.message.content.length / 4; // Approximate token count (4 chars ≈ 1 token)
                      set(state => ({
                        chats: state.chats.map(chat => 
                          chat.id === chatId ? {
                            ...chat,
                            messages: chat.messages.map(msg => 
                              msg.timestamp === aiMessage.timestamp 
                                ? { ...msg, text: aiText }
                                : msg
                            )
                          } : chat
                        ),
                      }));
                    }
                  } catch (error) {
                    console.error('Error parsing JSON:', error, 'Line:', line);
                    // Continue processing even if one line fails
                  }
                }

                // Update speed every 500ms to avoid UI spam
                if (Date.now() - lastUpdateTime > 500) {
                  const elapsedSeconds = (Date.now() - startTime) / 1000;
                  tokensPerSecond = Math.round(tokenCount / elapsedSeconds);
                  lastUpdateTime = Date.now();
                  
                  // Update state with current speed
                  // set(state => ({
                  //   ...state,
                  //   tokenSpeed: tokensPerSecond
                  // }));
                  updateSpeed(tokensPerSecond)
                }
              }
            }

            // Process any remaining data in buffer
            if (buffer.trim()) {
              try {
                const parsed = JSON.parse(buffer);
                if (parsed.message?.content) {
                  aiText += parsed.message.content;
                  // Update state with final content
                }
              } catch (error) {
                console.error('Error parsing final JSON:', error, 'Data:', buffer);
              }
            }

          } catch (error) {
          set((state) => ({
            chats: state.chats.map((chat) =>
              chat.id === chatId
                ? {
                    ...chat,
                    messages: chat.messages.map((msg) =>
                      msg.timestamp === aiMessage.timestamp
                        ? {
                            ...msg,
                            text: `Error: ${error.message}`,
                            isStreaming: false,
                          }
                        : msg,
                    ),
                  }
                : chat,
            ),
          }));
        } finally {
          // set(state => ({
          //   ...state,
          //   tokenSpeed: 0
          // }));
          updateSpeed(0)
        }

        // Finalize the AI message
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: chat.messages.map((msg) =>
                    msg.timestamp === aiMessage.timestamp
                      ? { ...msg, isStreaming: false }
                      : msg,
                  ),
                }
              : chat,
          ),
        }));
      },

      addMessage: (chatId, message) => {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: [...chat.messages, message],
                }
              : chat,
          ),
        }));
      },

      deleteChat: (chatId) => {
        set((state) => ({
          chats: state.chats.filter((chat) => chat.id !== chatId),
          currentChatId:
            state.currentChatId === chatId ? null : state.currentChatId,
        }));
      },

      setCurrentChat: (chatId) => {
        set({ currentChatId: chatId });
      },
    }),
    {
      name: "chat-storage",
      getStorage: () => localStorage,
    },
  ),
);

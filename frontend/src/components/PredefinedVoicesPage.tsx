import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit3, Volume2, Search, Mic } from 'lucide-react';
import { SharedVoiceRecorder } from './SharedVoiceRecorder';

interface PredefinedVoice {
    id: number;
    name: string;
    media_url: string;
    mime_type: string;
    duration: number;
    created_at: string;
}

export default function PredefinedVoicesPage() {
    const [voices, setVoices] = useState<PredefinedVoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    
    // Form state
    const [editingVoice, setEditingVoice] = useState<PredefinedVoice | null>(null);
    const [name, setName] = useState('');
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

    const fetchVoices = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/predefined-voices');
            const data = await res.json();
            if (data.success) {
                setVoices(data.data);
            }
        } catch (err) {
            console.error('Failed to fetch predefined voices:', err);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchVoices();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const formData = new FormData();
        formData.append('name', name);
        if (audioBlob) {
            formData.append('audio', audioBlob, 'voice.wav');
            formData.append('duration', '0'); // Will calculate precisely if needed, or pass from recorder
        }

        try {
            const url = editingVoice ? `/api/predefined-voices/${editingVoice.id}` : '/api/predefined-voices';
            const method = editingVoice ? 'PUT' : 'POST';
            
            const res = await fetch(url, {
                method,
                body: formData
            });
            const data = await res.json();
            
            if (data.success) {
                setShowModal(false);
                fetchVoices();
                resetForm();
            } else {
                alert('Failed to save voice');
            }
        } catch (err) {
            console.error('Save voice error', err);
            alert('Error saving voice');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this voice?')) return;
        try {
            await fetch(`/api/predefined-voices/${id}`, { method: 'DELETE' });
            fetchVoices();
        } catch (err) {
            console.error(err);
        }
    };

    const resetForm = () => {
        setName('');
        setAudioBlob(null);
        setEditingVoice(null);
    };

    const openCreateModal = () => {
        resetForm();
        setShowModal(true);
    };

    const openEditModal = (voice: PredefinedVoice) => {
        setEditingVoice(voice);
        setName(voice.name);
        setAudioBlob(null);
        setShowModal(true);
    };

    const filteredVoices = voices.filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#050D10] border border-teal-900/40 p-6 rounded-xl">
                <div>
                    <h2 className="text-xl font-bold text-teal-400 flex items-center gap-2">
                        <Mic size={24} /> Predefined Voices
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">Manage standard voice messages for quick replies.</p>
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="Search voices..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-[#03090C] border border-teal-900/40 rounded-lg py-2 pl-9 pr-4 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                        />
                    </div>
                    <button 
                        onClick={openCreateModal}
                        className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
                    >
                        <Plus size={16} /> Add Voice
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center text-slate-400 text-xs py-8">Loading voices...</div>
            ) : filteredVoices.length === 0 ? (
                <div className="text-center bg-[#050D10] border border-teal-900/40 p-8 rounded-xl">
                    <Mic size={32} className="mx-auto text-teal-900/60 mb-3" />
                    <p className="text-sm font-semibold text-slate-300">No voices found</p>
                    <p className="text-xs text-slate-500 mt-1">Create your first predefined voice snippet.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredVoices.map(voice => (
                        <div key={voice.id} className="bg-[#050D10] border border-teal-900/40 rounded-xl p-4 flex flex-col gap-4">
                            <div className="flex items-start justify-between">
                                <div className="font-semibold text-slate-200 text-sm truncate pr-2">{voice.name}</div>
                                <div className="flex gap-1">
                                    <button onClick={() => openEditModal(voice)} className="p-1.5 bg-[#091a20] hover:bg-teal-900/60 rounded text-teal-400 transition-colors">
                                        <Edit3 size={14} />
                                    </button>
                                    <button onClick={() => handleDelete(voice.id)} className="p-1.5 bg-[#091a20] hover:bg-red-900/40 rounded text-red-400 transition-colors">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="bg-[#03090C] rounded-lg p-3">
                                <audio src={voice.media_url} controls className="w-full h-8" />
                            </div>
                            
                            <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-auto">
                                <Volume2 size={12} /> Predefined Voice Snippet
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-[#0B1D25] border border-teal-500/30 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="p-6 border-b border-teal-900/40">
                            <h3 className="text-lg font-bold text-teal-400">
                                {editingVoice ? 'Edit Predefined Voice' : 'Add Predefined Voice'}
                            </h3>
                        </div>
                        
                        <form onSubmit={handleSave} className="p-6 space-y-6">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Voice Name / Title</label>
                                <input 
                                    type="text" 
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-[#050D10] border border-teal-900/40 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
                                    placeholder="e.g. Welcome Message, Order Confirmation"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Voice Recording</label>
                                <SharedVoiceRecorder 
                                    initialAudioUrl={editingVoice ? editingVoice.media_url : null}
                                    onAudioChange={(blob) => setAudioBlob(blob)}
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-teal-900/40">
                                <button 
                                    type="button" 
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    className="bg-teal-600 hover:bg-teal-500 text-white px-5 py-2 rounded-lg text-xs font-bold shadow-lg shadow-teal-600/20 transition-all"
                                >
                                    {editingVoice ? 'Save Changes' : 'Create Voice'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

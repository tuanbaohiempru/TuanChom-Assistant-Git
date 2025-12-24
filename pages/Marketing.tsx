
import React, { useState } from 'react';
import { AgentProfile } from '../types';
import { generateSocialPost, generateContentSeries, generateStory } from '../services/geminiService';

interface MarketingPageProps {
    profile: AgentProfile | null;
}

const MarketingPage: React.FC<MarketingPageProps> = ({ profile }) => {
    // --- Writer Sub-Modes ---
    const [writerMode, setWriterMode] = useState<'single' | 'series' | 'story'>('single');

    // --- State: Single Post ---
    const [topic, setTopic] = useState('');
    const [tone, setTone] = useState('Chuyên gia, Tin cậy');
    const [posts, setPosts] = useState<{title: string, content: string}[]>([]);

    // --- State: Series ---
    const [seriesTopic, setSeriesTopic] = useState('');
    const [seriesData, setSeriesData] = useState<{ day: string; type: string; content: string }[]>([]);

    // --- State: Storytelling ---
    const [storyFacts, setStoryFacts] = useState('');
    const [storyEmotion, setStoryEmotion] = useState('Cảm động, sâu sắc');
    const [storyResult, setStoryResult] = useState('');

    const [isGenerating, setIsGenerating] = useState(false);

    // --- Handlers ---
    const handleGeneratePost = async () => {
        if (!topic.trim()) return alert("Vui lòng nhập chủ đề!");
        setIsGenerating(true);
        const results = await generateSocialPost(topic, tone);
        setPosts(results);
        setIsGenerating(false);
    };

    const handleGenerateSeries = async () => {
        if (!seriesTopic.trim()) return alert("Vui lòng nhập tên chiến dịch!");
        setIsGenerating(true);
        const results = await generateContentSeries(seriesTopic);
        setSeriesData(results);
        setIsGenerating(false);
    };

    const handleGenerateStory = async () => {
        if (!storyFacts.trim()) return alert("Vui lòng nhập dữ kiện!");
        setIsGenerating(true);
        const result = await generateStory(storyFacts, storyEmotion);
        setStoryResult(result);
        setIsGenerating(false);
    };

    return (
        <div className="space-y-6 pb-10">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
                <i className="fas fa-bullhorn text-pru-red mr-3"></i> Marketing & Thương hiệu
            </h1>

            <div className="bg-white dark:bg-pru-card rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 min-h-[600px] flex flex-col transition-colors">
                
                {/* Writer Mode Selector */}
                <div className="flex justify-center mb-8">
                    <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg flex shadow-inner">
                        <button onClick={() => setWriterMode('single')} className={`px-4 py-2 rounded-md text-sm font-medium transition ${writerMode === 'single' ? 'bg-white dark:bg-gray-600 text-pru-red dark:text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                            Bài viết lẻ
                        </button>
                        <button onClick={() => setWriterMode('series')} className={`px-4 py-2 rounded-md text-sm font-medium transition ${writerMode === 'series' ? 'bg-white dark:bg-gray-600 text-pru-red dark:text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                            Chuỗi 5 Ngày (Series)
                        </button>
                        <button onClick={() => setWriterMode('story')} className={`px-4 py-2 rounded-md text-sm font-medium transition ${writerMode === 'story' ? 'bg-white dark:bg-gray-600 text-pru-red dark:text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                            Kể chuyện (Storytelling)
                        </button>
                    </div>
                </div>

                <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* LEFT: INPUT */}
                    <div className="space-y-5 border-r border-gray-100 dark:border-gray-800 pr-0 lg:pr-8">
                        {/* SINGLE MODE INPUT */}
                        {writerMode === 'single' && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-xs rounded-lg mb-4 border border-blue-100 dark:border-blue-900/30">
                                    <i className="fas fa-info-circle mr-1"></i> Tạo nhanh 3 lựa chọn cho 1 chủ đề.
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Chủ đề bài viết</label>
                                    <textarea 
                                        className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-3 rounded-lg focus:ring-2 focus:ring-pru-red outline-none h-32 resize-none"
                                        placeholder="VD: Ý nghĩa bảo hiểm nhân thọ..."
                                        value={topic}
                                        onChange={e => setTopic(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Giọng điệu</label>
                                    <select className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-3 rounded-lg outline-none" value={tone} onChange={e => setTone(e.target.value)}>
                                        <option>Chuyên gia, Tin cậy</option>
                                        <option>Hài hước, Vui vẻ</option>
                                        <option>Cảm xúc, Sâu sắc</option>
                                    </select>
                                </div>
                                <button onClick={handleGeneratePost} disabled={isGenerating} className="w-full bg-pru-red text-white py-3 rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 shadow-md">
                                    {isGenerating ? 'Đang viết...' : 'Tạo 3 mẫu Content'}
                                </button>
                            </div>
                        )}

                        {/* SERIES MODE INPUT */}
                        {writerMode === 'series' && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300 text-xs rounded-lg mb-4 border border-purple-100 dark:border-purple-900/30">
                                    <i className="fas fa-layer-group mr-1"></i> Xây dựng chuỗi 5 bài viết để nuôi dưỡng khách hàng từ lạ thành quen.
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Tên chiến dịch / Chủ đề lớn</label>
                                    <textarea 
                                        className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-3 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none h-32 resize-none"
                                        placeholder="VD: Tuần lễ Bảo vệ Trụ cột gia đình..."
                                        value={seriesTopic}
                                        onChange={e => setSeriesTopic(e.target.value)}
                                    />
                                </div>
                                <button onClick={handleGenerateSeries} disabled={isGenerating} className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50 shadow-md">
                                    {isGenerating ? 'Đang lên kế hoạch...' : 'Lập kế hoạch 5 ngày'}
                                </button>
                            </div>
                        )}

                        {/* STORY MODE INPUT */}
                        {writerMode === 'story' && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 text-xs rounded-lg mb-4 border border-orange-100 dark:border-orange-900/30">
                                    <i className="fas fa-book-open mr-1"></i> Biến dữ kiện khô khan thành câu chuyện chạm đến trái tim (Show, Don't Tell).
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Dữ kiện thô (Facts)</label>
                                    <textarea 
                                        className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-3 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none h-40 resize-none"
                                        placeholder="VD: Khách hàng A, 35 tuổi, vừa nhận quyền lợi 500tr..."
                                        value={storyFacts}
                                        onChange={e => setStoryFacts(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Cảm xúc chủ đạo</label>
                                    <select className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-3 rounded-lg outline-none" value={storyEmotion} onChange={e => setStoryEmotion(e.target.value)}>
                                        <option>Cảm động, Sâu sắc</option>
                                        <option>Cảnh tỉnh, Mạnh mẽ</option>
                                        <option>Truyền cảm hứng, Tươi sáng</option>
                                    </select>
                                </div>
                                <button onClick={handleGenerateStory} disabled={isGenerating} className="w-full bg-orange-500 text-white py-3 rounded-lg font-bold hover:bg-orange-600 disabled:opacity-50 shadow-md">
                                    {isGenerating ? 'Đang sáng tác...' : 'Kể chuyện'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: OUTPUT */}
                    <div className="lg:col-span-2 h-full overflow-y-auto max-h-[600px] scrollbar-hide">
                        {/* Output Single */}
                        {writerMode === 'single' && posts.map((post, idx) => (
                            <div key={idx} className="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 hover:shadow-md transition">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">{post.title}</span>
                                    <button onClick={() => {navigator.clipboard.writeText(post.content); alert("Copied!")}} className="text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400"><i className="fas fa-copy"></i></button>
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{post.content}</p>
                            </div>
                        ))}

                        {/* Output Series */}
                        {writerMode === 'series' && (
                            <div className="space-y-0 relative">
                                {seriesData.length > 0 && <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-700"></div>}
                                {seriesData.map((day, idx) => (
                                    <div key={idx} className="relative pl-10 pb-8 last:pb-0">
                                        <div className="absolute left-0 w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full border-4 border-white dark:border-pru-card shadow-sm flex items-center justify-center text-xs font-bold text-purple-600 dark:text-purple-400 z-10">
                                            {idx + 1}
                                        </div>
                                        <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:shadow-lg transition group">
                                            <div className="flex justify-between items-center mb-3">
                                                <div>
                                                    <span className="font-bold text-purple-700 dark:text-purple-400 block">{day.day}</span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">{day.type}</span>
                                                </div>
                                                <button onClick={() => {navigator.clipboard.writeText(day.content); alert("Copied!")}} className="w-8 h-8 rounded-full bg-gray-50 dark:bg-gray-700 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-600 dark:hover:text-purple-400 flex items-center justify-center transition"><i className="fas fa-copy"></i></button>
                                            </div>
                                            <div className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                                {day.content}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Output Story */}
                        {writerMode === 'story' && storyResult && (
                            <div className="bg-orange-50/30 dark:bg-orange-900/10 p-8 rounded-xl border border-orange-100 dark:border-orange-900/30">
                                <div className="flex justify-end mb-4">
                                    <button onClick={() => {navigator.clipboard.writeText(storyResult); alert("Copied!")}} className="text-orange-400 dark:text-orange-300 hover:text-orange-600 dark:hover:text-orange-200 flex items-center gap-2 text-sm font-bold"><i className="fas fa-copy"></i> Sao chép</button>
                                </div>
                                <div className="prose prose-orange dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-serif text-lg leading-relaxed">
                                    {storyResult}
                                </div>
                                <div className="mt-8 pt-4 border-t border-orange-100 dark:border-orange-900/30 text-center">
                                    <i className="fas fa-feather-alt text-orange-300 dark:text-orange-600 text-2xl"></i>
                                </div>
                            </div>
                        )}

                        {/* Empty State */}
                        {((writerMode === 'single' && posts.length === 0) || 
                          (writerMode === 'series' && seriesData.length === 0) || 
                          (writerMode === 'story' && !storyResult)) && !isGenerating && (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 opacity-50">
                                <i className="fas fa-magic text-6xl mb-4"></i>
                                <p>Sẵn sàng sáng tạo nội dung...</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MarketingPage;

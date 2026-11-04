const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

// ================= 1. CẤU HÌNH CƠ BẢN =================
const SPREADSHEET_ID = '1wr6WHUF3i8U0b-BVv0AVw5JjfT9ojOwtzqf41tVdjrw';
const SHEET_NAME = 'Trang tính1'; 

// ================= 2. TỪ ĐIỂN TÀI KHOẢN =================
const ACCOUNTS = {
    'FB - Cafe Số': { 
        type: 'FACEBOOK', 
        id: '510347025492019', 
        token: 'EAAQygEX3PaQBSyvZBx8L7g54kZBv4sXG37H6koUvi01qHjEgZBx2Nz65zQhnwEZCqm51aPxtd6F3YbjZA60cLkk6IOWTfOwsO38EocUMtCZAe6EGRhAaUuZCjrDszZB7lc2GdxqVYVNNwhGBXg2fZCL6YACEm3Xwx40vPLkmJLTXaetdzeV1HZAas98YV35KLglZCiUhIR7g4ZCENbvSbJ1ZAPrB5' 
    },
    'FB - Thế Giới Trẻ Thơ': { 
        type: 'FACEBOOK', 
        id: '108894505424425', 
        token: 'EAAQygEX3PaQBSZBeeDjHymx7Ju37LPLslzzWbLhnJueL2MXr1ZAl33TAHZBMgEYdmLErTHraZCFcZCJYtZApCXtJGk0EflgpDiCPqapaqgsDdfCNOzDodpLVddm88xqKK8yEfXPkAZCsxR04TBjt9acDDX5K5s27Rrn1K4CHno1ZAf17QewDiJqKdSZAvMyIUR85ykDTSkYmyyNjZAFQekQ4IdJIswplHudmaEZA4HVO1HdlBH2KLtnEkfFFdXF8NEZD' 
    },
    'YT - Cafe Số': { 
        type: 'YOUTUBE', 
        clientId: '5800787278-1kvg105bh2g15vred661h93imrh4kiuq.apps.googleusercontent.com', 
        clientSecret: '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', 
        refreshToken: '1//04sAqFrzPe8WUCgYIARAAGAQSNwF-L9IrfmzZWCamCa6aNT3QAW-gvfCUrPohxEpobCnwBf9qBtqOQI_jozQeiZCbKLHKlLKLDpo' 
    },
    'YT - Góc Mẹ Và Bé': { 
        type: 'YOUTUBE', 
        clientId: '5800787278-1kvg105bh2g15vred661h93imrh4kiuq.apps.googleusercontent.com', 
        clientSecret: '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', 
        refreshToken: '1//04eFcdGCwRUsSCgYIARAAGAQSNwF-L9Ir5wLTJggMPC5p6wc2BeVkn7MgIhEeljo-09bQj8Uawy_-HKncJxnQ84eabtESE2ZPVEk' 
    }
};

const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

function parseDateStringVN(dateStr) {
    if (!dateStr) return null;
    try {
        const parts = dateStr.trim().split(' ');
        if (parts.length < 2) return null; // Sửa lỗi nếu thiếu khoảng trắng
        const [day, month, year] = parts[0].split('/');
        const time = parts[1].slice(0, 5); // Cắt lấy chính xác HH:MM, loại bỏ số giây nếu vô tình bị thêm vào
        return new Date(`${year}-${month}-${day}T${time}:00+07:00`);
    } catch (e) {
        return null;
    }
}

async function kiemTraVaDangBai() {
    console.log('🔄 Đang kiểm tra lịch đăng...');
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const now = new Date(); 

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:H100`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) return console.log('⚠️ Không có dữ liệu bài viết nào trong bảng.');

        for (let i = 0; i < rows.length; i++) {
            const [thoiGian, loaiBai, nenTang, tieuDe, noiDung, linkDrive, linkAffiliate, trangThai] = rows[i] || [];

            if (!trangThai || !trangThai.includes('Đã đăng')) {
                const scheduledTime = parseDateStringVN(thoiGian);
                
                // IN CẢNH BÁO NẾU THỜI GIAN LỖI HOẶC CHƯA TỚI GIỜ
                if (!scheduledTime) {
                    console.log(`⚠️ Lỗi định dạng thời gian ở bài: "${tieuDe || 'Không tên'}". Vui lòng kiểm tra lại file Sheets.`);
                    continue;
                }
                if (now < scheduledTime) {
                    console.log(`⏳ Chưa tới giờ đăng bài: "${tieuDe || 'Không tên'}" (Lịch hẹn: ${scheduledTime.toLocaleString('vi-VN')})`);
                    continue; 
                }

                let finalCaption = noiDung || '';
                if (linkAffiliate) finalCaption += `\n\n👉 Mua ngay: ${linkAffiliate}`;

                const accountConfig = ACCOUNTS[nenTang ? nenTang.trim() : ''];
                const loaiBaiChuan = loaiBai ? loaiBai.trim() : ''; // Loại bỏ dấu cách thừa
                
                if (accountConfig) {
                    try {
                        console.log(`-> Đang xử lý [${loaiBaiChuan}] cho [${nenTang}]...`);
                        const arrLinks = linkDrive ? linkDrive.split(',').map(l => l.trim()).filter(l => l) : [];
                        
                        // ===== XỬ LÝ FACEBOOK =====
                        if (accountConfig.type === 'FACEBOOK') {
                            let postId = null;

                            if (loaiBaiChuan === 'Text') {
                                postId = await dangBaiTextFacebook(finalCaption, accountConfig.id, accountConfig.token);
                            } else {
                                if (arrLinks.length === 0) throw new Error('Không có link thư mục Drive');
                                if (loaiBaiChuan === 'Video' || arrLinks.length === 1) {
                                    const ext = loaiBaiChuan === 'Image' ? '.jpg' : '.mp4';
                                    const tempFilePath = path.join(__dirname, `temp_${Date.now()}${ext}`);
                                    
                                    console.log(`   ⏳ Đang tải file từ Drive xuống máy...`);
                                    await downloadFileDrive(arrLinks[0], tempFilePath);
                                    console.log(`   ✅ Tải file xong, đang đẩy lên Facebook...`);
                                    
                                    if (loaiBaiChuan === 'Image') postId = await dangBaiImageFacebook(finalCaption, tempFilePath, accountConfig.id, accountConfig.token);
                                    else postId = await dangBaiVideoFacebook(finalCaption, tempFilePath, accountConfig.id, accountConfig.token);
                                    
                                    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                                } else if (loaiBaiChuan === 'Image' && arrLinks.length > 1) {
                                    const mediaIds = [];
                                    const downloadedFiles = [];
                                    for (let j = 0; j < arrLinks.length; j++) {
                                        const tempFilePath = path.join(__dirname, `temp_multi_${Date.now()}_${j}.jpg`);
                                        await downloadFileDrive(arrLinks[j], tempFilePath);
                                        downloadedFiles.push(tempFilePath);
                                        const photoId = await dangAnhAnFacebook(tempFilePath, accountConfig.id, accountConfig.token);
                                        mediaIds.push(photoId);
                                    }
                                    postId = await dangNhieuAnhFacebook(finalCaption, mediaIds, accountConfig.id, accountConfig.token);
                                    downloadedFiles.forEach(file => { if (fs.existsSync(file)) fs.unlinkSync(file); });
                                }
                            }

                            // --- AUTO COMMENT CHO FACEBOOK ---
                            if (postId && linkAffiliate) {
                                const commentText = `👉 Xem và đặt mua sản phẩm tại đây nhé: ${linkAffiliate}`;
                                await axios.post(`https://graph.facebook.com/v18.0/${postId}/comments`, {
                                    message: commentText,
                                    access_token: accountConfig.token
                                });
                                console.log(`💬 Đã tự động thả comment FB: ${postId}`);
                            }
                        } 
                        // ===== XỬ LÝ YOUTUBE =====
                        else if (accountConfig.type === 'YOUTUBE' && loaiBaiChuan === 'Video') {
                            if (arrLinks.length === 0) throw new Error('Không có link Drive');
                            const tempFilePath = path.join(__dirname, `temp_yt_${Date.now()}.mp4`);
                            
                            console.log(`   ⏳ Đang tải Video từ Drive xuống máy...`);
                            await downloadFileDrive(arrLinks[0], tempFilePath);
                            
                            const oauth2Client = new google.auth.OAuth2(accountConfig.clientId, accountConfig.clientSecret);
                            oauth2Client.setCredentials({ refresh_token: accountConfig.refreshToken });
                            const youtubeApi = google.youtube({ version: 'v3', auth: oauth2Client });
                            
                            console.log(`   ✅ Tải Video xong, đang đẩy lên YouTube...`);
                            const uploadResponse = await youtubeApi.videos.insert({
                                part: 'snippet,status',
                                requestBody: {
                                    snippet: { title: tieuDe || 'Video', description: finalCaption },
                                    status: { privacyStatus: 'public' }
                                },
                                media: { body: fs.createReadStream(tempFilePath) }
                            });
                            
                            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                            const videoId = uploadResponse.data.id;

                            // --- AUTO COMMENT CHO YOUTUBE ---
                            if (videoId && linkAffiliate) {
                                const commentText = `👉 Xem và đặt mua sản phẩm tại đây nhé: ${linkAffiliate}`;
                                await youtubeApi.commentThreads.insert({
                                    part: 'snippet',
                                    requestBody: {
                                        snippet: {
                                            videoId: videoId,
                                            topLevelComment: { snippet: { textOriginal: commentText } }
                                        }
                                    }
                                });
                                console.log(`💬 Đã tự động thả comment YT: ${videoId}`);
                            }
                        }

                        // Cập nhật Sheets
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID,
                            range: `${SHEET_NAME}!H${i + 2}`,
                            valueInputOption: 'USER_ENTERED',
                            resource: { values: [['Đã đăng']] },
                        });
                        console.log(`✅ Hoàn tất lên ${nenTang}`);
                    } catch (err) {
                        // SỬA LỖI HIỂN THỊ Ở ĐÂY ĐỂ BIẾT CHÍNH XÁC FB/YT ĐANG BÁO GÌ
                        console.error(`❌ Lỗi hệ thống khi đăng lên ${nenTang}:`, JSON.stringify(err.response?.data || err.message, null, 2));
                    }
                } else {
                    console.log(`⚠️ Không tìm thấy cấu hình tài khoản cho: "${nenTang}". Kiểm tra lại tên ở cột Nền tảng.`);
                }
            }
        }
    } catch (error) {
        console.error('❌ Lỗi kết nối File Google Sheets:', error.message);
    }
}

// ===== CÁC HÀM TIỆN ÍCH =====
async function downloadFileDrive(driveLink, destPath) {
    const fileIdMatch = driveLink.match(/[-\w]{25,}/);
    if (!fileIdMatch) throw new Error('Link Drive không hợp lệ (Không tìm thấy ID)');
    const directUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[0]}`;
    const writer = fs.createWriteStream(destPath);
    const response = await axios({ url: directUrl, method: 'GET', responseType: 'stream' });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}
async function dangBaiTextFacebook(message, pageId, pageToken) {
    const res = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/feed`, null, { params: { message, access_token: pageToken }});
    return res.data.id;
}
async function dangBaiImageFacebook(message, filePath, pageId, pageToken) {
    const form = new FormData(); form.append('message', message); form.append('access_token', pageToken); form.append('source', fs.createReadStream(filePath));
    const res = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/photos`, form, { headers: form.getHeaders() });
    return res.data.id; // API /photos có trả về biến id
}
async function dangBaiVideoFacebook(message, filePath, pageId, pageToken) {
    const form = new FormData(); form.append('description', message); form.append('access_token', pageToken); form.append('source', fs.createReadStream(filePath));
    const res = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/videos`, form, { headers: form.getHeaders() });
    return res.data.id;
}
async function dangAnhAnFacebook(filePath, pageId, pageToken) {
    const form = new FormData(); form.append('published', 'false'); form.append('access_token', pageToken); form.append('source', fs.createReadStream(filePath));
    const res = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/photos`, form, { headers: form.getHeaders() }); 
    return res.data.id;
}
async function dangNhieuAnhFacebook(message, mediaIds, pageId, pageToken) {
    const params = { message, access_token: pageToken };
    mediaIds.forEach((id, index) => { params[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id }); });
    const res = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/feed`, null, { params });
    return res.data.id;
}

kiemTraVaDangBai();

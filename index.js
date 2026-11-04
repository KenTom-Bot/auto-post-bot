const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

// ================= CẤU HÌNH CƠ BẢN =================
const SPREADSHEET_ID = 'ĐIỀN_ID_BẢNG_TÍNH_VÀO_ĐÂY';
const SHEET_NAME = 'Trang tính1'; 

// TỪ ĐIỂN FANPAGE: Bạn có thể thêm bao nhiêu Page tùy ý
const FB_ACCOUNTS = {
    'FB - Cafe Số': {
        id: 'ĐIỀN_ID_PAGE_CAFE_SO',
        token: 'ĐIỀN_TOKEN_PAGE_CAFE_SO'
    },
    'FB - Shop Giày': {
        id: 'ĐIỀN_ID_PAGE_THU_2',
        token: 'ĐIỀN_TOKEN_PAGE_THU_2'
    }
    // Thêm các page khác theo cú pháp tương tự...
};

const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Hàm ép kiểu giờ trên Sheets (DD/MM/YYYY HH:mm) chuẩn theo múi giờ Việt Nam (+7)
function parseDateStringVN(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.trim().split(' ');
    if (parts.length !== 2) return null;
    const [day, month, year] = parts[0].split('/');
    const time = parts[1];
    return new Date(`${year}-${month}-${day}T${time}:00+07:00`);
}

async function kiemTraVaDangBai() {
    console.log('🔄 Đang kiểm tra lịch đăng...');
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:H100`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) return console.log('Không có dữ liệu.');

        const now = new Date(); 
        console.log(`⏰ Giờ hệ thống hiện tại: ${now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);

        for (let i = 0; i < rows.length; i++) {
            const [thoiGian, loaiBai, nenTang, tieuDe, noiDung, linkDrive, linkAffiliate, trangThai] = rows[i] || [];

            if (!trangThai || !trangThai.includes('Đã đăng')) {
                
                // 1. KIỂM TRA HẸN GIỜ
                const scheduledTime = parseDateStringVN(thoiGian);
                if (!scheduledTime) {
                    console.log(`⚠️ Hàng ${i + 2}: Lỗi định dạng thời gian (Cần dạng DD/MM/YYYY HH:mm)`);
                    continue;
                }
                if (now < scheduledTime) {
                    console.log(`⏳ Hàng ${i + 2}: Chưa đến giờ đăng (${thoiGian}). Đang bỏ qua...`);
                    continue; // Bỏ qua, chờ chu kỳ Github 30 phút sau quét lại
                }

                // 2. NẾU ĐÃ ĐẾN GIỜ -> TIẾN HÀNH ĐĂNG
                let finalCaption = noiDung || '';
                if (linkAffiliate) finalCaption += `\n\n👉 Mua ngay tại đây: ${linkAffiliate}`;

                if (nenTang && nenTang.startsWith('FB - ')) {
                    const fbConfig = FB_ACCOUNTS[nenTang.trim()];
                    if (!fbConfig) {
                        console.log(`❌ Hàng ${i + 2}: Chưa cấu hình ID và Token cho ${nenTang} trong code.`);
                        continue;
                    }
                    const { id: pageId, token: pageToken } = fbConfig;

                    try {
                        if (loaiBai === 'Text') {
                            console.log(`-> Đang đăng Text lên ${nenTang}...`);
                            await dangBaiTextFacebook(finalCaption, pageId, pageToken);
                        } 
                        else if (loaiBai === 'Image' || loaiBai === 'Video') {
                            const arrLinks = linkDrive ? linkDrive.split(',').map(l => l.trim()).filter(l => l) : [];
                            if (arrLinks.length === 0) throw new Error('Không có link Drive nào');

                            if (loaiBai === 'Video' || arrLinks.length === 1) {
                                const ext = loaiBai === 'Image' ? '.jpg' : '.mp4';
                                const tempFilePath = path.join(__dirname, `temp_${Date.now()}${ext}`);
                                
                                await downloadFileDrive(arrLinks[0], tempFilePath);
                                if (loaiBai === 'Image') {
                                    await dangBaiImageFacebook(finalCaption, tempFilePath, pageId, pageToken);
                                } else {
                                    await dangBaiVideoFacebook(finalCaption, tempFilePath, pageId, pageToken);
                                }
                                fs.unlinkSync(tempFilePath); 
                            } 
                            else if (loaiBai === 'Image' && arrLinks.length > 1) {
                                const mediaIds = [];
                                const downloadedFiles = [];

                                for (let j = 0; j < arrLinks.length; j++) {
                                    const tempFilePath = path.join(__dirname, `temp_multi_${Date.now()}_${j}.jpg`);
                                    await downloadFileDrive(arrLinks[j], tempFilePath);
                                    downloadedFiles.push(tempFilePath);
                                    
                                    const photoId = await dangAnhAnFacebook(tempFilePath, pageId, pageToken);
                                    mediaIds.push(photoId);
                                }
                                await dangNhieuAnhFacebook(finalCaption, mediaIds, pageId, pageToken);
                                downloadedFiles.forEach(file => fs.unlinkSync(file));
                            }
                        }

                        // Ghi chú "Đã đăng" vào Google Sheets
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID,
                            range: `${SHEET_NAME}!H${i + 2}`,
                            valueInputOption: 'USER_ENTERED',
                            resource: { values: [['Đã đăng']] },
                        });
                        console.log(`✅ Hoàn tất đăng hàng ${i + 2} lên ${nenTang}`);
                        
                    } catch (err) {
                        console.error(`❌ Lỗi hàng ${i + 2} (${nenTang}):`, err.message);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Lỗi hệ thống:', error.message);
    }
}

// ================= CÁC HÀM XỬ LÝ API =================

async function downloadFileDrive(driveLink, destPath) {
    const fileIdMatch = driveLink.match(/[-\w]{25,}/);
    if (!fileIdMatch) throw new Error('Link Google Drive không hợp lệ');
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
    const response = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/feed`, null, {
        params: { message: message, access_token: pageToken }
    });
    return response.data.id;
}

async function dangBaiImageFacebook(message, filePath, pageId, pageToken) {
    const form = new FormData();
    form.append('message', message);
    form.append('access_token', pageToken);
    form.append('source', fs.createReadStream(filePath));
    const response = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/photos`, form, { headers: form.getHeaders() });
    return response.data.id;
}

async function dangBaiVideoFacebook(message, filePath, pageId, pageToken) {
    const form = new FormData();
    form.append('description', message);
    form.append('access_token', pageToken);
    form.append('source', fs.createReadStream(filePath));
    const response = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/videos`, form, { headers: form.getHeaders() });
    return response.data.id;
}

async function dangAnhAnFacebook(filePath, pageId, pageToken) {
    const form = new FormData();
    form.append('published', 'false'); 
    form.append('access_token', pageToken);
    form.append('source', fs.createReadStream(filePath));
    const response = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/photos`, form, { headers: form.getHeaders() });
    return response.data.id;
}

async function dangNhieuAnhFacebook(message, mediaIds, pageId, pageToken) {
    const params = { message: message, access_token: pageToken };
    mediaIds.forEach((id, index) => {
        params[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id });
    });
    const response = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/feed`, null, { params: params });
    return response.data.id;
}

kiemTraVaDangBai();

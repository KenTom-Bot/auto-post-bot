const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

// ================= CẤU HÌNH CƠ BẢN =================
const SPREADSHEET_ID = 'ĐIỀN_ID_BẢNG_TÍNH_CỦA_BẠN_VÀO_ĐÂY';
const FB_PAGE_ID = 'ĐIỀN_ID_FANPAGE_VÀO_ĐÂY'; 
const FB_PAGE_TOKEN = 'ĐIỀN_MÃ_PAGE_TOKEN_CHUẨN_VÀO_ĐÂY';
const SHEET_NAME = 'Trang tính1'; 

const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function kiemTraVaDangBai() {
    console.log('🔄 Đang kiểm tra lịch đăng từ Google Sheets...');
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:H100`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) return console.log('Không có dữ liệu.');

        for (let i = 0; i < rows.length; i++) {
            const [thoiGian, loaiBai, nenTang, tieuDe, noiDung, linkDrive, linkAffiliate, trangThai] = rows[i];

            if (!trangThai || !trangThai.includes('Đã đăng')) {
                let finalCaption = noiDung || '';
                if (linkAffiliate) finalCaption += `\n\n👉 Mua ngay tại đây: ${linkAffiliate}`;

                if (nenTang && nenTang.includes('FB - Cafe Số')) {
                    try {
                        if (loaiBai === 'Text') {
                            console.log(`-> Đang đăng Text...`);
                            await dangBaiTextFacebook(finalCaption);
                        } 
                        else if (loaiBai === 'Image' || loaiBai === 'Video') {
                            // Tách các link bằng dấu phẩy và loại bỏ khoảng trắng
                            const arrLinks = linkDrive ? linkDrive.split(',').map(l => l.trim()).filter(l => l) : [];
                            if (arrLinks.length === 0) throw new Error('Không có link Drive nào');

                            if (loaiBai === 'Video' || arrLinks.length === 1) {
                                // Luồng cũ: Đăng 1 video hoặc 1 ảnh
                                const ext = loaiBai === 'Image' ? '.jpg' : '.mp4';
                                const tempFilePath = path.join(__dirname, `temp_${Date.now()}${ext}`);
                                
                                console.log(`-> Đang tải 1 ${loaiBai} từ Google Drive...`);
                                await downloadFileDrive(arrLinks[0], tempFilePath);
                                
                                console.log(`-> Đang đẩy ${loaiBai} lên Facebook...`);
                                if (loaiBai === 'Image') {
                                    await dangBaiImageFacebook(finalCaption, tempFilePath);
                                } else {
                                    await dangBaiVideoFacebook(finalCaption, tempFilePath);
                                }
                                fs.unlinkSync(tempFilePath); // Xóa file tạm
                            } 
                            else if (loaiBai === 'Image' && arrLinks.length > 1) {
                                // Luồng mới: Đăng nhiều ảnh
                                console.log(`-> Phát hiện ${arrLinks.length} ảnh. Đang xử lý tải xuống...`);
                                const mediaIds = [];
                                const downloadedFiles = [];

                                // Tải và up ẩn từng ảnh
                                for (let j = 0; j < arrLinks.length; j++) {
                                    const tempFilePath = path.join(__dirname, `temp_multi_${Date.now()}_${j}.jpg`);
                                    await downloadFileDrive(arrLinks[j], tempFilePath);
                                    downloadedFiles.push(tempFilePath);
                                    
                                    console.log(`-> Tải lên ảnh ${j+1}/${arrLinks.length} (chế độ ẩn) lên FB...`);
                                    const photoId = await dangAnhAnFacebook(tempFilePath);
                                    mediaIds.push(photoId);
                                }

                                // Gộp các ID ảnh và đăng bài
                                console.log(`-> Đang xuất bản bài viết chứa ${mediaIds.length} ảnh...`);
                                await dangNhieuAnhFacebook(finalCaption, mediaIds);

                                // Dọn dẹp tất cả file tạm
                                downloadedFiles.forEach(file => fs.unlinkSync(file));
                            }
                        }

                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID,
                            range: `${SHEET_NAME}!H${i + 2}`,
                            valueInputOption: 'USER_ENTERED',
                            resource: { values: [['Đã đăng']] },
                        });
                        console.log(`✅ Hoàn tất hàng ${i + 2}`);
                        
                    } catch (err) {
                        console.error(`❌ Lỗi ở hàng ${i + 2}:`, err.message);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Lỗi Google Sheets:', error.message);
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

async function dangBaiTextFacebook(message) {
    const response = await axios.post(`https://graph.facebook.com/v18.0/${FB_PAGE_ID}/feed`, null, {
        params: { message: message, access_token: FB_PAGE_TOKEN }
    });
    return response.data.id;
}

async function dangBaiImageFacebook(message, filePath) {
    const form = new FormData();
    form.append('message', message);
    form.append('access_token', FB_PAGE_TOKEN);
    form.append('source', fs.createReadStream(filePath));
    const response = await axios.post(`https://graph.facebook.com/v18.0/${FB_PAGE_ID}/photos`, form, {
        headers: form.getHeaders()
    });
    return response.data.id;
}

async function dangBaiVideoFacebook(message, filePath) {
    const form = new FormData();
    form.append('description', message);
    form.append('access_token', FB_PAGE_TOKEN);
    form.append('source', fs.createReadStream(filePath));
    const response = await axios.post(`https://graph.facebook.com/v18.0/${FB_PAGE_ID}/videos`, form, {
        headers: form.getHeaders()
    });
    return response.data.id;
}

// --- HÀM MỚI CHO TÍNH NĂNG NHIỀU ẢNH ---

async function dangAnhAnFacebook(filePath) {
    const form = new FormData();
    form.append('published', 'false'); // Bắt buộc false để ảnh không bị đẩy thẳng lên tường
    form.append('access_token', FB_PAGE_TOKEN);
    form.append('source', fs.createReadStream(filePath));
    const response = await axios.post(`https://graph.facebook.com/v18.0/${FB_PAGE_ID}/photos`, form, {
        headers: form.getHeaders()
    });
    return response.data.id;
}

async function dangNhieuAnhFacebook(message, mediaIds) {
    const params = { message: message, access_token: FB_PAGE_TOKEN };
    mediaIds.forEach((id, index) => {
        params[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id });
    });
    const response = await axios.post(`https://graph.facebook.com/v18.0/${FB_PAGE_ID}/feed`, null, { params: params });
    return response.data.id;
}

kiemTraVaDangBai();
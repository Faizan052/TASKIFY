const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs').promises;

const normalizeExtractedText = (text) => {
  return (text || '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\t ]{2,}/g, ' ')
    .trim();
};

/**
 * Extract text content from PDF files
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} Extracted text content
 */
async function parsePDF(filePath) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdfParse(dataBuffer);
    return normalizeExtractedText(data.text);
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to parse PDF document');
  }
}

/**
 * Extract text content from Word (.docx) files
 * @param {string} filePath - Path to the Word file
 * @returns {Promise<string>} Extracted text content
 */
async function parseWord(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return normalizeExtractedText(result.value);
  } catch (error) {
    console.error('Error parsing Word document:', error);
    throw new Error('Failed to parse Word document');
  }
}

/**
 * Parse document based on file extension
 * @param {string} filePath - Path to the document
 * @param {string} mimetype - MIME type of the file
 * @returns {Promise<string>} Extracted text content
 */
async function parseDocument(filePath, mimetype) {
  if (!filePath) {
    throw new Error('File path is required');
  }

  const lowerPath = filePath.toLowerCase();

  // Legacy .doc parsing is not reliable with local libraries; fail clearly.
  if (lowerPath.endsWith('.doc')) {
    throw new Error('Legacy .doc files are not supported. Please upload .docx or .pdf');
  }

  // Determine parser based on mimetype
  if (mimetype === 'application/pdf' || lowerPath.endsWith('.pdf')) {
    return await parsePDF(filePath);
  } else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerPath.endsWith('.docx')
  ) {
    return await parseWord(filePath);
  } else if (mimetype === 'text/plain' || lowerPath.endsWith('.txt')) {
    const text = await fs.readFile(filePath, 'utf8');
    return normalizeExtractedText(text);
  } else {
    throw new Error('Unsupported document format. Use PDF or DOCX files');
  }
}

module.exports = {
  parseDocument,
  parsePDF,
  parseWord
};

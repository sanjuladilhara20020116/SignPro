using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf.IO;
using SignPro.Api.Data;
using SignPro.Api.DTOs;
using SignPro.Api.Models;

namespace SignPro.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DocumentsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IWebHostEnvironment _environment;

    private const long MaxPdfSize = 20 * 1024 * 1024;

    public DocumentsController(AppDbContext context, IWebHostEnvironment environment)
    {
        _context = context;
        _environment = environment;
    }

    [HttpPost("upload")]
    [RequestSizeLimit(MaxPdfSize)]
    public async Task<IActionResult> UploadPdf([FromForm] IFormFile file)
    {
        var userId = GetCurrentUserId();

        if (userId <= 0)
        {
            return Unauthorized(new { message = "Invalid user token. Please login again." });
        }

        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "Please upload a PDF file." });
        }

        if (file.Length > MaxPdfSize)
        {
            return BadRequest(new { message = "PDF file size must be less than 20MB." });
        }

        var extension = Path.GetExtension(file.FileName).ToLower();

        if (extension != ".pdf")
        {
            return BadRequest(new { message = "Only PDF files are allowed." });
        }

        var isPdf = await IsPdfFileAsync(file);

        if (!isPdf)
        {
            return BadRequest(new { message = "Invalid PDF file content." });
        }

        var webRoot = GetWebRootPath();
        var uploadFolder = Path.Combine(webRoot, "uploads", "pdfs");

        Directory.CreateDirectory(uploadFolder);

        var originalFileName = Path.GetFileName(file.FileName);
        var storedFileName = $"{Guid.NewGuid():N}.pdf";
        var fullPath = Path.Combine(uploadFolder, storedFileName);

        await using (var stream = new FileStream(fullPath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        _context.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            Action = $"Uploaded PDF: {originalFileName}",
            Timestamp = DateTime.UtcNow,
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown"
        });

        await _context.SaveChangesAsync();

        var fileUrl = $"{Request.Scheme}://{Request.Host}/uploads/pdfs/{storedFileName}";

        return Ok(new UploadPdfResponseDto
        {
            OriginalFileName = originalFileName,
            StoredFileName = storedFileName,
            FilePath = $"/uploads/pdfs/{storedFileName}",
            FileUrl = fileUrl,
            SizeInBytes = file.Length
        });
    }

    [HttpPost("sign")]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public async Task<IActionResult> SignPdf([FromForm] SignPdfRequestDto dto)
    {
        var userId = GetCurrentUserId();

        if (userId <= 0)
        {
            return Unauthorized(new { message = "Invalid user token. Please login again." });
        }

        if (dto.File == null || dto.File.Length == 0)
        {
            return BadRequest(new { message = "Please upload a PDF file." });
        }

        if (dto.File.Length > MaxPdfSize)
        {
            return BadRequest(new { message = "PDF file size must be less than 20MB." });
        }

        if (Path.GetExtension(dto.File.FileName).ToLower() != ".pdf")
        {
            return BadRequest(new { message = "Only PDF files are allowed." });
        }

        var isPdf = await IsPdfFileAsync(dto.File);

        if (!isPdf)
        {
            return BadRequest(new { message = "Invalid PDF file content." });
        }

        if (string.IsNullOrWhiteSpace(dto.SignatureBase64))
        {
            return BadRequest(new { message = "Signature image is required." });
        }

        if (dto.PageNumber < 1)
        {
            return BadRequest(new { message = "Invalid page number." });
        }

        if (dto.Width <= 0 || dto.Height <= 0)
        {
            return BadRequest(new { message = "Invalid signature size." });
        }

        if (dto.PreviewPageWidth <= 0 || dto.PreviewPageHeight <= 0)
        {
            return BadRequest(new { message = "Invalid preview page size." });
        }

        var webRoot = GetWebRootPath();

        var pdfFolder = Path.Combine(webRoot, "uploads", "pdfs");
        var signatureFolder = Path.Combine(webRoot, "uploads", "signatures");
        var signedFolder = Path.Combine(webRoot, "uploads", "signed");

        Directory.CreateDirectory(pdfFolder);
        Directory.CreateDirectory(signatureFolder);
        Directory.CreateDirectory(signedFolder);

        var originalFileName = Path.GetFileName(dto.File.FileName);
        var originalStoredName = $"{Guid.NewGuid():N}.pdf";
        var originalPdfPath = Path.Combine(pdfFolder, originalStoredName);

        await using (var fileStream = new FileStream(originalPdfPath, FileMode.Create))
        {
            await dto.File.CopyToAsync(fileStream);
        }

        var signatureBytes = DecodeBase64Image(dto.SignatureBase64);
        var signatureFileName = $"{Guid.NewGuid():N}.png";
        var signaturePath = Path.Combine(signatureFolder, signatureFileName);

        await System.IO.File.WriteAllBytesAsync(signaturePath, signatureBytes);

        var signedFileName = $"signed_{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}.pdf";
        var signedPdfPath = Path.Combine(signedFolder, signedFileName);

        using (var document = PdfReader.Open(originalPdfPath, PdfDocumentOpenMode.Modify))
        {
            if (dto.PageNumber > document.Pages.Count)
            {
                return BadRequest(new { message = "Selected page does not exist in this PDF." });
            }

            var page = document.Pages[dto.PageNumber - 1];

            var scaleX = page.Width.Point / dto.PreviewPageWidth;
            var scaleY = page.Height.Point / dto.PreviewPageHeight;

            var pdfX = dto.X * scaleX;
            var pdfY = dto.Y * scaleY;
            var pdfWidth = dto.Width * scaleX;
            var pdfHeight = dto.Height * scaleY;

            using var graphics = XGraphics.FromPdfPage(page);
            using var signatureImage = XImage.FromFile(signaturePath);

            graphics.DrawImage(signatureImage, pdfX, pdfY, pdfWidth, pdfHeight);

            if (dto.AddDateStamp || !string.IsNullOrWhiteSpace(dto.SignerName))
            {
                var signerText = string.IsNullOrWhiteSpace(dto.SignerName)
                    ? "Digitally signed"
                    : $"Signed by {dto.SignerName}";

                var dateText = $"Date: {DateTime.Now:yyyy-MM-dd HH:mm}";

                var font = new XFont("Arial", 9, XFontStyle.Regular);
                var brush = XBrushes.Black;

                var textY = pdfY + pdfHeight + 12;

                if (textY + 24 < page.Height.Point)
                {
                    graphics.DrawString(signerText, font, brush, new XPoint(pdfX, textY));

                    if (dto.AddDateStamp)
                    {
                        graphics.DrawString(dateText, font, brush, new XPoint(pdfX, textY + 12));
                    }
                }
            }

            document.Save(signedPdfPath);
        }

        var signatureRecord = new Signature
        {
            UserId = userId,
            SignatureImagePath = $"/uploads/signatures/{signatureFileName}",
            CreatedAt = DateTime.UtcNow
        };

        var signedDocument = new Document
        {
            UserId = userId,
            OriginalFileName = originalFileName,
            SignedFileName = signedFileName,
            FilePath = $"/uploads/signed/{signedFileName}",
            SignedAt = DateTime.UtcNow
        };

        _context.Signatures.Add(signatureRecord);
        _context.Documents.Add(signedDocument);

        _context.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            Action = $"Signed PDF: {originalFileName}",
            Timestamp = DateTime.UtcNow,
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown"
        });

        await _context.SaveChangesAsync();

        var signedBytes = await System.IO.File.ReadAllBytesAsync(signedPdfPath);

        return File(
            signedBytes,
            "application/pdf",
            signedFileName
        );
    }

    [HttpGet("history")]
public async Task<IActionResult> GetHistory()
{
    var userId = GetCurrentUserId();

    if (userId <= 0)
    {
        return Unauthorized(new { message = "Invalid user token. Please login again." });
    }

    var documents = await _context.Documents
        .Where(d => d.UserId == userId)
        .OrderByDescending(d => d.SignedAt)
        .Select(d => new DocumentHistoryDto
        {
            Id = d.Id,
            OriginalFileName = d.OriginalFileName,
            SignedFileName = d.SignedFileName,
            FilePath = d.FilePath,
            FileUrl = $"{Request.Scheme}://{Request.Host}{d.FilePath}",
            SignedAt = d.SignedAt
        })
        .ToListAsync();

    return Ok(documents);
}

    [HttpGet("download/{id:int}")]
    public async Task<IActionResult> DownloadSignedPdf(int id)
    {
        var userId = GetCurrentUserId();

        if (userId <= 0)
        {
            return Unauthorized(new { message = "Invalid user token. Please login again." });
        }

        var document = await _context.Documents
            .FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId);

        if (document == null)
        {
            return NotFound(new { message = "Document not found." });
        }

        var webRoot = GetWebRootPath();

        var relativePath = document.FilePath
            .TrimStart('/')
            .Replace("/", Path.DirectorySeparatorChar.ToString());

        var fullPath = Path.Combine(webRoot, relativePath);

        if (!System.IO.File.Exists(fullPath))
        {
            return NotFound(new { message = "Signed PDF file is missing." });
        }

        var fileBytes = await System.IO.File.ReadAllBytesAsync(fullPath);

        _context.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            Action = $"Downloaded signed PDF: {document.OriginalFileName}",
            Timestamp = DateTime.UtcNow,
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown"
        });

        await _context.SaveChangesAsync();

        return File(
            fileBytes,
            "application/pdf",
            document.SignedFileName
        );
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteSignedPdf(int id)
    {
        var userId = GetCurrentUserId();

        if (userId <= 0)
        {
            return Unauthorized(new { message = "Invalid user token. Please login again." });
        }

        var document = await _context.Documents
            .FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId);

        if (document == null)
        {
            return NotFound(new { message = "Document not found." });
        }

        var webRoot = GetWebRootPath();

        var relativePath = document.FilePath
            .TrimStart('/')
            .Replace("/", Path.DirectorySeparatorChar.ToString());

        var fullPath = Path.Combine(webRoot, relativePath);

        if (System.IO.File.Exists(fullPath))
        {
            System.IO.File.Delete(fullPath);
        }

        _context.Documents.Remove(document);

        _context.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            Action = $"Deleted signed PDF: {document.OriginalFileName}",
            Timestamp = DateTime.UtcNow,
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown"
        });

        await _context.SaveChangesAsync();

        return Ok(new { message = "Document deleted successfully." });
    }

    private int GetCurrentUserId()
    {
        var userIdText =
            User.FindFirstValue(ClaimTypes.NameIdentifier) ??
            User.FindFirstValue("nameid") ??
            User.FindFirstValue("sub") ??
            User.FindFirstValue("id") ??
            User.FindFirstValue("userId") ??
            User.FindFirstValue("UserId");

        if (!int.TryParse(userIdText, out var userId))
        {
            return 0;
        }

        return userId;
    }

    private string GetWebRootPath()
    {
        var webRoot = _environment.WebRootPath;

        if (string.IsNullOrWhiteSpace(webRoot))
        {
            webRoot = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        }

        return webRoot;
    }

    private static async Task<bool> IsPdfFileAsync(IFormFile file)
    {
        await using var stream = file.OpenReadStream();

        var headerBytes = new byte[5];
        var bytesRead = await stream.ReadAsync(headerBytes, 0, headerBytes.Length);

        if (bytesRead < 5)
        {
            return false;
        }

        var header = Encoding.ASCII.GetString(headerBytes);

        return header == "%PDF-";
    }

    private static byte[] DecodeBase64Image(string base64)
    {
        var commaIndex = base64.IndexOf(',');

        if (commaIndex >= 0)
        {
            base64 = base64[(commaIndex + 1)..];
        }

        return Convert.FromBase64String(base64);
    }
}
using Microsoft.AspNetCore.Http;

namespace SignPro.Api.DTOs;

public class SignPdfRequestDto
{
    public IFormFile File { get; set; } = default!;

    public string SignatureBase64 { get; set; } = string.Empty;

    public int PageNumber { get; set; }

    public double X { get; set; }

    public double Y { get; set; }

    public double Width { get; set; }

    public double Height { get; set; }

    public double PreviewPageWidth { get; set; }

    public double PreviewPageHeight { get; set; }

    public string? SignerName { get; set; }

    public bool AddDateStamp { get; set; } = true;
}
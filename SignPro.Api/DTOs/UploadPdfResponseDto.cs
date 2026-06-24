namespace SignPro.Api.DTOs;

public class UploadPdfResponseDto
{
    public string OriginalFileName { get; set; } = string.Empty;

    public string StoredFileName { get; set; } = string.Empty;

    public string FilePath { get; set; } = string.Empty;

    public string FileUrl { get; set; } = string.Empty;

    public long SizeInBytes { get; set; }
}
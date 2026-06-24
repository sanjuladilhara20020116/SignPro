namespace SignPro.Api.DTOs;

public class DocumentHistoryDto
{
    public int Id { get; set; }

    public string OriginalFileName { get; set; } = string.Empty;

    public string SignedFileName { get; set; } = string.Empty;

    public string FilePath { get; set; } = string.Empty;

    public string FileUrl { get; set; } = string.Empty;

    public DateTime SignedAt { get; set; }
}
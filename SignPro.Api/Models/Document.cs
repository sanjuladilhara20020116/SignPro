using System.ComponentModel.DataAnnotations;

namespace SignPro.Api.Models;

public class Document
{
    public int Id { get; set; }

    public int UserId { get; set; }

    [Required]
    public string OriginalFileName { get; set; } = string.Empty;

    [Required]
    public string SignedFileName { get; set; } = string.Empty;

    [Required]
    public string FilePath { get; set; } = string.Empty;

    public DateTime SignedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}